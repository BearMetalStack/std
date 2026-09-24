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
	isHueRampName,
	listCustomThemeNames,
	lookupVariantToken,
	normalizeMediaQuery,
	REQUIRED_BASE_RAMPS,
	REQUIRED_HUE_RAMPS,
	REQUIRED_RAMPS,
	SEMANTIC_ROLES,
	type Theme,
	validateRamps,
	type Variant,
	VARIANT_TOKENS,
	type VariantTokenDef,
	variantTokensByGroup,
} from "@bearmetal/drip";
import { namespaces } from "@bearmetal/drip/namespaces";
import { generateSteps, writeAliasRamp } from "../drip/doAColor.ts";
import { accessorResolves, parseDripValue } from "../drip/dripValues.ts";

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
		"Creates a Drip theme from seed colors, or merges the colors into an existing theme of the same name. " +
		`Every theme needs these ramps to be complete: ${REQUIRED_RAMPS.join(", ")}. ` +
		`The semantic ones (${
			SEMANTIC_ROLES.join(", ")
		}) should use \`alias\` to point at one of the required hues (${
			REQUIRED_HUE_RAMPS.join(", ")
		}) rather than being seeded independently, so state colors never compete with brand for attention.`,
	inputSchema: s.object({
		themeName: s.string().describe("Name of the theme to create or add colors to"),
		colors: s.array(s.object({
			name: s.string().describe(
				"The name of the color in the theme. Normalised to kebab-case on write, so `bg_base`, `bgBase` and `BG Base` all become `bg-base` and are referenced as `$color.bg-base.<stop>`. Use `.` to nest a ramp, e.g. `brand.grey`",
			),
			identity: colorString.describe(
				"The hex value of the color to use as the identity of the color scale. Omit when providing `alias` instead",
			).optional(),
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
			alias: s.enum(...REQUIRED_HUE_RAMPS).describe(
				`Instead of seeding a new scale, make this ramp a full alias of one of the required hues (${
					REQUIRED_HUE_RAMPS.join(", ")
				}) — every stop becomes a \`$color.<hue>.<stop>\` reference. This is how the semantic ramps (${
					SEMANTIC_ROLES.join(", ")
				}) are meant to be created: pick the hue that reads as typical for the role (danger→red, success→green, warning→orange, info→blue) unless the brief calls for something else. Mutually exclusive with \`identity\`/\`stop\`/\`manualStops\``,
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
			const {
				identity: rawIdentity,
				name: rawName,
				stop,
				useProportionalScale,
				manualStops,
				alias,
			} of colors
		) {
			const name = normalizeRampName(rawName);
			written.push(name);
			if (alias) {
				if (rawIdentity || manualStops) {
					throw new Error(
						`'${rawName}' provided both 'alias' and 'identity'/'manualStops' — pick one`,
					);
				}
				if (!isHueRampName(alias)) {
					throw new Error(
						`'${alias}' is not a required hue — alias must be one of: ${
							REQUIRED_HUE_RAMPS.join(", ")
						}`,
					);
				}
				writeAliasRamp(theme, name, alias);
				continue;
			}
			if (!rawIdentity) {
				throw new Error(`'${rawName}' needs either 'identity' or 'alias'`);
			}
			const identity = normalizeHex(rawIdentity);
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
		const missing = validateRamps(theme);
		const missingNote = missing.length
			? ` Still missing ${missing.length} required ramp${missing.length === 1 ? "" : "s"}: ${
				missing.map((m) => m.ramp).join(", ")
			}.`
			: " Every required ramp is now defined.";
		return `Created theme ${name_} with ${colors.length} colors. Reference them as: ${
			written.map((name) => `$color.${name}.<stop>`).join(", ")
		}.${missingNote}`;
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
 *
 * Every field is schema-optional, even the ones the manifest marks
 * `required` — that flag is enforced in the handler instead, where it can
 * apply differently to a default variant (must set everything) and a
 * non-default one (only the deltas). A schema-level `required` would force
 * every call, including a two-line dark-mode tweak, to restate the full
 * manifest.
 */
function variantTokenFields(): Record<string, Schema<string | undefined>> {
	const fields: Record<string, Schema<string | undefined>> = {};
	for (const token of VARIANT_TOKENS) {
		const description = `${token.description} (${token.property})${
			token.required ? ". Required on the default variant" : `. ${describeDefault(token)}`
		}`;
		fields[token.key] = s.string().describe(description).optional();
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

		// The default variant is the one every other variant's unset tokens fall
		// through to via the cascade, so it has to be complete — a non-default
		// variant is fine stating only what changes.
		if (isDefault) {
			const missing = VARIANT_TOKENS.filter((t) => !variantRules[t.property]);
			if (missing.length) {
				throw new Error(
					`The default variant must define every token (${missing.length} missing: ${
						missing.map((t) => t.key).join(", ")
					}) — every other variant falls back to whatever the default sets, so an incomplete default leaves them with holes too.`,
				);
			}
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

		const omittedRequired = isDefault
			? []
			: VARIANT_TOKENS.filter((t) => t.required && !variantRules[t.property]);
		const omittedOptional = VARIANT_TOKENS.filter((t) => !t.required && !variantRules[t.property]);
		const note = [
			omittedRequired.length
				? ` ${omittedRequired.length} token${
					omittedRequired.length === 1 ? "" : "s"
				} usually set on every variant ${
					omittedRequired.length === 1 ? "was" : "were"
				} left unset here (${
					omittedRequired.map((t) => t.key).join(", ")
				}) — fine for a delta, but double check that's deliberate.`
				: "",
			omittedOptional.length
				? ` ${omittedOptional.length} optional token${
					omittedOptional.length === 1 ? "" : "s"
				} were left to derive from the ones you set.`
				: "",
		].join("");
		return existingIndex === -1
			? `Theme variant '${name}' added to ${themeName}.${note}`
			: `Theme variant '${name}' replaced in ${themeName}.${note}`;
	},
	annotations: {
		idempotentHint: true,
		destructiveHint: true,
	},
});

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

Work in three passes, using the tools on this server.

**Pass 1 — the required ramps.** Call \`create_theme\` once with every required ramp: ${
			REQUIRED_BASE_RAMPS.join(", ")
		}. Derive the palette from the brief's own world rather than from generic UI defaults; the
seeds are what give the theme its identity. \`brand\` and \`accent\` are the two colors that carry
the theme's identity — make them distinct from each other, not just tints of one hue. \`neutral\`
can take a slight hue bias from \`brand\`; a pure gray reads as unconsidered. The eight hues (${
			REQUIRED_HUE_RAMPS.join(", ")
		}) exist so every theme can back its semantic colors with something visually distinct from
branding — seed them true to their name (a believable red, a believable green) even if the
brief's palette is unusual, since pass 2 depends on them reading correctly.

For each ramp pass \`identity\` (six-digit hex) and the \`stop\` that hex should occupy — the
generator interpolates the rest of the scale outward in OKLCH from that anchor. Pick the stop
deliberately: a color seeded at \`500\` sits mid-scale, one seeded at \`900\` becomes a dark
ground with pale tints above it.

**Pass 2 — semantic colors and any extras.** Call \`create_theme\` again for ${
			SEMANTIC_ROLES.join(", ")
		}, each with \`alias\` pointing at one of pass 1's hues rather than a fresh \`identity\` —
this is what keeps state colors from competing with the brand for attention. The typical mapping
is danger→red, success→green, warning→orange, info→blue; deviate only if the brief specifically
calls for it. Add any other freeform ramps the brief wants in this same pass.

**Pass 3 — the variants.** Call \`add_theme_variant\` twice against the same theme.

- light: \`default: true\`, no media query
- dark: \`media: "(prefers-color-scheme: dark)"\` — include the parentheses

The **default** variant (light) must set every one of the ${VARIANT_TOKENS.length} tokens below —
it's what every other variant's unset tokens fall back to, so it can't be half-defined. The
**dark** variant only needs to state what actually changes; anything it leaves out inherits the
light variant's value automatically.

${OPTIONAL_TOKEN_TABLE}

(The ${REQUIRED_TOKENS.length} tokens not listed above — ${
			REQUIRED_TOKENS.join(", ")
		} — have no sensible derived value, so get them right deliberately rather than accepting a
fallback.)

Reference the ramps through the accessor form \`$color.<ramp>.<stop>\` (for example
\`$color.brand.600\` or \`$color.danger.100\`) rather than repeating raw hex, so the variants stay
tied to the scales. Only reference ramps and stops you actually created in passes 1-2 —
\`add_theme_variant\` rejects a reference it cannot resolve, because a dangling one produces CSS
that silently fails to apply.

Design the dark variant deliberately instead of inverting the light one. Fills usually want a
bright stop on dark grounds (around 400) and a dark stop on light grounds (around 500-600), and
text tokens should stay above 4.5:1 against the ground they sit on in both variants.

The \`btn*Fg\` tokens are the ink on each filled control, and they are the ones most often gotten
wrong: pick each one against its own \`btn*Bg\`, not against the page. A bright fill wants dark
ink and a dark fill wants light ink, and the choice usually flips between the two variants.

Finish by calling \`list_current_themes\` to confirm the theme was written, then summarize the
palette: each ramp, its seed, and what it does in the design.`,
});
