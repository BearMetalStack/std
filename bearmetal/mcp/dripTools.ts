import {
	DEFAULT_LIGHTNESS_MAP,
	hexToSrgb,
	srgbToOklch,
	STOPS,
	toKebabCase,
} from "@bearmetal/miscellanea";
import { server as defaultServer } from "@bearmetal/mcp";
import { s, type Schema } from "@bearmetal/forge";
import { dotBearmetalFile } from "@bearmetal/miscellanea/fs";
import {
	listCustomThemeNames,
	lookupVariantToken,
	normalizeMediaQuery,
	type Theme,
	type Variant,
	VARIANT_TOKENS,
	type VariantTokenDef,
	variantTokensByGroup,
} from "@bearmetal/drip";
import { namespaces } from "@bearmetal/drip/namespaces";
import { generateSteps } from "../drip/doAColor.ts";

const server = defaultServer();

/**
 * `hexToSrgb` slices six hex digits, so a three-digit shorthand silently
 * produces `NaN` channels. Anchor the pattern and require all six.
 */
const colorString = s.string().regex(
	/^#?[0-9a-f]{6}$/i,
	"Color must be a six-digit hex code, e.g. #1d3327",
);
const stopString = s.string().regex(
	/^(50|[1-9]00|950)$/,
	"Not a valid color stop (expected 50, 100-900, or 950)",
);

/** Normalise a hex colour to the `#rrggbb` form the theme files store. */
function normalizeHex(hex: string): string {
	return "#" + hex.replace("#", "").toLowerCase();
}

/**
 * Ramp names become CSS custom property segments, so they are normalised to the
 * kebab case the rest of the namespace uses: `bg_base`, `bgBase` and `BG Base`
 * all become `bg-base`, and all reach the same `--color-bg-base-500`.
 *
 * `.` is the only structural character — it nests the ramp, mirroring the
 * accessor syntax — so the accessor for a ramp is always its normalised name
 * with the stop appended.
 */
function normalizeRampName(name: string): string {
	const segments = name.split(".").map((segment) => toKebabCase(segment));
	if (segments.some((segment) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(segment))) {
		throw new Error(
			`Invalid color name '${name}' — use letters, numbers and word separators, with '.' to nest`,
		);
	}
	return segments.join(".");
}

/** Reject names that would escape the themes directory or produce an odd file. */
function assertThemeName(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) throw new Error("Theme name is empty");
	if (!/^[\w.-]+$/.test(trimmed) || trimmed.startsWith(".")) {
		throw new Error(
			`Invalid theme name '${name}' — use letters, numbers, '_', '-' or '.' only`,
		);
	}
	return trimmed;
}
server.addTool({
	name: "create_theme",
	description:
		"Creates a Drip theme from seed colors, or merges the colors into an existing theme of the same name",
	inputSchema: s.object({
		themeName: s.string().describe("Name of the theme to create or add colors to"),
		colors: s.array(s.object({
			name: s.string().describe(
				"The name of the color in the theme. Normalised to kebab-case on write, so `bg_base`, `bgBase` and `BG Base` all become `bg-base` and are referenced as `$color.bg-base.<stop>`. Use `.` to nest a ramp, e.g. `brand.grey`",
			),
			identity: colorString.describe(
				"The hex value of the color to use as the identity of the color scale",
			),
			stop: s.enum(...STOPS.map(String))
				.describe(
					"The color stop that the identity color should occupy on the scale. The default calculates its approximate position on the scale according to its lightness",
				).optional(),
			manualStops: s.array(s.object({
				color: colorString.describe("The hex value of the color"),
				stop: stopString.describe("The stop to use for the color"),
			})).describe("Optional color scale to use instead of automatically generating one.")
				.optional(),
			useProportionalScale: s.boolean().describe(
				"Whether the steps on either side should remain proportional to each other as opposed to ensuring each extreme reaches near-white or near-black",
			).optional(),
		})),
	}),
	annotations: {
		idempotentHint: true,
	},
	handler: async ({ colors, themeName }) => {
		const name_ = assertThemeName(themeName);
		const themeFile = await dotBearmetalFile(namespaces.themes, name_ + ".theme.json");
		const theme = await themeFile.readJson<Theme>();
		const written: string[] = [];
		for (
			const { identity: rawIdentity, name: rawName, stop, useProportionalScale, manualStops }
				of colors
		) {
			const identity = normalizeHex(rawIdentity);
			const name = normalizeRampName(rawName);
			written.push(name);
			if (manualStops) {
				let current = (theme.color ??= {}) as Theme;
				current = name.split(".").reduce(
					(acc, part) => ((acc as Theme)[part] ??= {}) as Theme,
					current,
				);
				for (const { color, stop } of manualStops) {
					current[stop] = normalizeHex(color);
				}
				continue;
			}
			const oklch = srgbToOklch(hexToSrgb(identity));
			const recommendedStop = STOPS.toSorted((a, b) => {
				const diffA = Math.abs(DEFAULT_LIGHTNESS_MAP[a] - oklch.l),
					diffB = Math.abs(DEFAULT_LIGHTNESS_MAP[b] - oklch.l);
				return diffA - diffB;
			})[0];
			const colorStop = isNaN(Number(stop)) ? recommendedStop : Number(stop);
			generateSteps(theme, { hex: identity, name, stop: colorStop }, useProportionalScale);
		}
		await themeFile.writeJson(theme);
		return `Created theme ${name_} with ${colors.length} colors. Reference them as: ${
			written.map((name) => `$color.${name}.<stop>`).join(", ")
		}`;
	},
});

server.addTool({
	name: "list_current_themes",
	description: "Returns a list of all themes available in the current context",
	inputSchema: s.object({}),
	handler: async () => ({ themes: await listCustomThemeNames() }),
	outputSchema: s.object({ themes: s.array(s.string()).describe("A list of theme names") }),
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
	},
});

/** How a token behaves when a variant leaves it out, for the tool description. */
function describeDefault(token: VariantTokenDef): string {
	if (token.from) return `optional — defaults to \`${token.from}\``;
	if (token.fallback) return `optional — defaults to \`${token.fallback}\``;
	return "optional";
}

/**
 * The variant schema is generated from Drip's token manifest rather than
 * written out here, so the tool and the generator can never disagree about
 * which slots exist or which custom property a key writes to.
 */
function variantTokenFields(): Record<string, Schema<string | undefined>> {
	const fields: Record<string, Schema<string | undefined>> = {};
	for (const token of VARIANT_TOKENS) {
		const description = `${token.description} (${token.property})${
			token.required ? "" : `. ${describeDefault(token)}`
		}`;
		fields[token.key] = token.required
			? s.string().describe(description)
			: s.string().describe(description).optional();
	}
	return fields;
}

const Variant = s.object({
	name: s.string().describe('The name of the theme variant, e.g. "light"'),
	default: s.boolean().describe(
		"Whether this theme should be used as the default, only one per theme",
	).optional(),
	media: s.string().describe(
		"Media query that triggers the variant automatically, written without the `@media` keyword and with its parentheses, e.g. `(prefers-color-scheme: dark)`. A bare feature test is wrapped for you",
	).optional(),
	...variantTokenFields(),
});

/**
 * Walks a `$namespace.path.to.token` accessor against the theme it will be
 * resolved in. A miss produces CSS that is invalid at computed-value time —
 * the declaration is dropped and the token silently inherits — so it is worth
 * catching here, where the author can still fix it.
 */
function accessorResolves(theme: Theme, accessor: string): boolean {
	const path = accessor.slice(1).split(".");
	let node: unknown = theme;
	for (const segment of path) {
		if (!node || typeof node !== "object") return false;
		const record = node as Record<string, unknown>;
		if (!(segment in record)) return false;
		node = record[segment];
	}
	if (typeof node === "string") return true;
	if (node && typeof node === "object") {
		const record = node as Record<string, unknown>;
		return typeof record[""] === "string" || typeof record.base === "string" ||
			"$ref" in record;
	}
	return false;
}
server.addTool({
	name: "add_theme_variant",
	description: "Adds a variant such as light or dark mode to a theme using Drip compliant names",
	inputSchema: s.object({
		theme: s.string().describe("Name of the theme to modify"),
		replace: s.boolean().describe(
			"Overwrite a variant that already has this name instead of failing. Defaults to false, so a repeated call is a clear error rather than a duplicate variant",
		).optional(),
		variant: Variant.describe(
			"Theme variant definitions. Provide colors either as raw CSS values or use Drip's accessor format (`$<namespace>.path.to.property`, e.g. `$color.info.muted.300`)",
		),
	}),
	handler: async ({ theme, variant, replace }) => {
		const { name, media, default: isDefault, ...rules } = variant;
		const themeName = assertThemeName(theme);
		const themeFile = await dotBearmetalFile(namespaces.themes, themeName + ".theme.json");
		const themeData = await themeFile.readJson<Theme>();
		const variantsKey = themeData["#variants"] && !themeData.variants ? "#variants" : "variants";
		const variants = (themeData[variantsKey] ??= []) as Variant[];

		const existingIndex = variants.findIndex((v) => v.name === name);
		if (existingIndex !== -1 && !replace) {
			throw new Error(
				`Theme ${themeName} already has a variant named '${name}'. Pass replace: true to overwrite it`,
			);
		}
		if (isDefault) {
			const existingDefault = variants.findIndex((v) => v.default);
			if (existingDefault !== -1 && existingDefault !== existingIndex) {
				throw new Error(
					`Theme ${themeName} already has a default variant ('${variants[existingDefault].name}')`,
				);
			}
		}

		const variantRules: Record<string, string> = {};
		const dangling: string[] = [];
		for (const [key, value] of Object.entries(rules)) {
			if (typeof value !== "string" || !value) continue;
			const token = lookupVariantToken(key);
			if (!token) throw new Error(`Unknown variant token '${key}'`);
			if (value.startsWith("$") && !accessorResolves(themeData, value)) {
				dangling.push(`${key}: ${value}`);
			}
			variantRules[token.property] = parseDripValue(value);
		}
		if (dangling.length) {
			throw new Error(
				`Theme ${themeName} has no such ramp or stop for ${dangling.length} reference${
					dangling.length === 1 ? "" : "s"
				} — ${
					dangling.join(", ")
				}. A dangling reference produces CSS that silently fails to apply; create the ramp with create_theme first, or use a raw CSS value.`,
			);
		}

		const entry: Variant = {
			name,
			default: isDefault,
			rules: variantRules,
			media: media === undefined ? undefined : normalizeMediaQuery(media),
		};
		if (existingIndex === -1) variants.push(entry);
		else variants[existingIndex] = entry;

		await themeFile.writeJson(themeData);

		const omitted = VARIANT_TOKENS.filter((t) => !t.required && !variantRules[t.property]);
		const note = omitted.length
			? ` ${omitted.length} optional token${
				omitted.length === 1 ? "" : "s"
			} were left to derive from the ones you set.`
			: "";
		return existingIndex === -1
			? `Theme variant '${name}' added to ${themeName}.${note}`
			: `Theme variant '${name}' replaced in ${themeName}.${note}`;
	},
	annotations: {
		idempotentHint: true,
		destructiveHint: true,
	},
});

function parseDripValue(val: string) {
	if (!val.startsWith("$")) return val;
	return `var(${val.replaceAll(".", "-").replace("$", "--")})`;
}

const REQUIRED_TOKENS = VARIANT_TOKENS.filter((t) => t.required).map((t) => t.key);

/** The optional half of the manifest, grouped, for the prompt's reference table. */
const OPTIONAL_TOKEN_TABLE = [...variantTokensByGroup()]
	.map(([group, tokens]) => {
		const optional = tokens.filter((t) => !t.required);
		if (!optional.length) return "";
		return `- **${group}** — ${optional.map((t) => `\`${t.key}\``).join(", ")}`;
	})
	.filter(Boolean)
	.join("\n");

server.addPrompt({
	name: "design_theme",
	title: "Design a Drip theme",
	description:
		"Turn a described feel or design goal into a complete Drip theme: seeded color ramps plus light and dark variants",
	argumentSchema: s.object({
		feel: s.string().describe(
			"The feel or design goal to translate into a palette, e.g. 'a quiet archival library' or 'high-contrast terminal for night shifts'",
		),
		themeName: s.string().describe(
			"Name for the theme. Letters, numbers, '_', '-' and '.' only. Omit to derive one from the feel",
		).optional(),
		notes: s.string().describe(
			"Any extra constraints: brand colors to honor, colors to avoid, accessibility targets",
		).optional(),
	}),
	handler: ({ feel, themeName, notes }) =>
		`Design a Drip theme for this brief: ${feel}

${
			themeName
				? `Name the theme \`${themeName}\`.`
				: "Choose a short, evocative name for the theme."
		}${notes ? `\n\nAdditional constraints: ${notes}` : ""}

Work in two passes, using the tools on this server.

**Pass 1 — the ramps.** Call \`create_theme\` once with every color. Derive the palette from the
brief's own world rather than from generic UI defaults; the seeds are what give the theme its
identity. Provide at least:

- \`bg_base\` and a surface color — the grounds everything sits on
- \`primary\` — the accent that carries the theme
- \`success\`, \`error\`, \`warning\`, \`info\` — semantic colors, each visibly distinct from
  \`primary\` so state never reads as branding
- a text color for dark grounds and one for light grounds
- a border color and a neutral

Give the neutral a slight hue bias toward the accent; a pure grey reads as unconsidered. For each
color pass \`identity\` (six-digit hex) and the \`stop\` that hex should occupy — the generator
interpolates the rest of the scale outward in OKLCH from that anchor. Pick the stop deliberately:
a color seeded at \`500\` sits mid-scale, one seeded at \`900\` becomes a dark ground with pale
tints above it.

**Pass 2 — the variants.** Call \`add_theme_variant\` twice against the same theme.

- light: \`default: true\`, no media query
- dark: \`media: "(prefers-color-scheme: dark)"\` — include the parentheses

These ${REQUIRED_TOKENS.length} keys are required in each variant: ${REQUIRED_TOKENS.join(", ")}.

Every other token derives from one of those if you leave it out, so a variant is never
half-defined. Set the ones you have an opinion about and let the rest follow:

${OPTIONAL_TOKEN_TABLE}

Reference the ramps through the accessor form \`$color.<ramp>.<stop>\` (for example
\`$color.primary.600\`) rather than repeating raw hex, so the variants stay tied to the scales.
Only reference ramps and stops you actually created in pass 1 — \`add_theme_variant\` rejects a
reference it cannot resolve, because a dangling one produces CSS that silently fails to apply.

Design the dark variant deliberately instead of inverting the light one. Fills usually want a
bright stop on dark grounds (around 400) and a dark stop on light grounds (around 500-600), and
text tokens should stay above 4.5:1 against the ground they sit on in both variants.

The \`btn*Fg\` tokens are the ink on each filled control, and they are the ones most often gotten
wrong: pick each one against its own \`btn*Bg\`, not against the page. A bright fill wants dark
ink and a dark fill wants light ink, and the choice usually flips between the two variants.

Finish by calling \`list_current_themes\` to confirm the theme was written, then summarize the
palette: each ramp, its seed, and what it does in the design.`,
});
