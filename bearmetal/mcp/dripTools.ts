import {
	DEFAULT_LIGHTNESS_MAP,
	hexToSrgb,
	srgbToOklch,
	STOPS,
	toKebabCase,
} from "@bearmetal/miscellanea";
import { server as defaultServer } from "@bearmetal/mcp";
import { s } from "@bearmetal/forge";
import { dotBearmetalFile } from "@bearmetal/miscellanea/fs";
import { listCustomThemeNames, type Theme } from "@bearmetal/drip";
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
 * Drip interpolates `media` straight into `@media <value> {`, so a bare
 * `prefers-color-scheme: dark` yields invalid CSS and the whole variant block
 * is discarded by the parser. Accept the forgiving forms and emit a valid one.
 */
function normalizeMedia(media: string): string {
	let query = media.trim().replace(/^@media\s+/i, "").trim();
	if (!query) throw new Error("Media query is empty");

	let depth = 0;
	for (const char of query) {
		if (char === "(") depth++;
		else if (char === ")" && --depth < 0) break;
	}
	if (depth !== 0) throw new Error(`Unbalanced parentheses in media query: ${media}`);

	if (!query.includes("(") && query.includes(":")) query = `(${query})`;
	return query;
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
			name: s.string().describe("The name of the color in the theme"),
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
		for (const { identity: rawIdentity, name, stop, useProportionalScale, manualStops } of colors) {
			const identity = normalizeHex(rawIdentity);
			if (manualStops) {
				let current = (theme.color ??= {}) as Theme;
				current = name.split("-").reduce(
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
		return `Created theme ${name_} with ${colors.length} colors`;
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

const Variant = s.object({
	name: s.string().describe('The name of the theme variant, e.g. "light"'),
	default: s.boolean().describe(
		"Whether this theme should be used as the default, only one per theme",
	).optional(),
	media: s.string().describe(
		"Media query that triggers the variant automatically, written without the `@media` keyword and with its parentheses, e.g. `(prefers-color-scheme: dark)`. A bare feature test is wrapped for you",
	).optional(),
	bg: s.string().describe("Background color"),
	bgSubtle: s.string().describe("Subtle background color"),
	bgMuted: s.string().describe("Muted background color"),
	bgEmphasis: s.string().describe("Emphasis background color"),
	surface: s.string().describe("Surface background color"),
	surfaceRaised: s.string().describe("Raised surface background color"),
	surfaceOverlay: s.string().describe("Overlay surface background color"),
	text: s.string().describe("Text color"),
	textSubtle: s.string().describe("Subtle text color"),
	textMuted: s.string().describe("Muted text color"),
	textDisabled: s.string().describe("Disabled text color"),
	border: s.string().describe("Border color"),
	borderStrong: s.string().describe("Strong border color"),
	borderSubtle: s.string().describe("Subtle border color"),
	interactive: s.string().describe("Interactive color"),
	interactiveHover: s.string().describe("Interactive hover color"),
	toastBg: s.string().describe("Toast background color"),
	toastColor: s.string().describe("Toast text color"),
	toastBorder: s.string().describe("Toast border color"),
	successText: s.string().describe("Success text color"),
	successBg: s.string().describe("Success background color"),
	btnSuccessBg: s.string().describe("Success button background color"),
	dangerText: s.string().describe("Danger text color"),
	dangerBg: s.string().describe("Danger background color"),
	btnDangerBg: s.string().describe("Danger button background color"),
	warningText: s.string().describe("Warning text color"),
	warningBg: s.string().describe("Warning background color"),
	btnWarningBg: s.string().describe("Warning button background color"),
	infoText: s.string().describe("Info text color"),
	infoBg: s.string().describe("Info background color"),
	btnInfoBg: s.string().describe("Info button background color"),
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
		const variants = themeData["#variants"] ??= [];

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
		for (const [key, value] of Object.entries(rules)) {
			if (!value) continue;
			let name = toKebabCase(key);
			if (!name.startsWith("btn") && !name.startsWith("toast")) name = "color-" + name;
			name = "--" + name;
			variantRules[name] = parseDripValue(value);
		}
		const entry = {
			name,
			default: isDefault,
			rules: variantRules,
			media: media === undefined ? undefined : normalizeMedia(media),
		};
		if (existingIndex === -1) variants.push(entry);
		else variants[existingIndex] = entry;

		await themeFile.writeJson(themeData);
		return existingIndex === -1
			? `Theme variant '${name}' added to ${themeName}`
			: `Theme variant '${name}' replaced in ${themeName}`;
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

const SEMANTIC_TOKENS = Object.keys(Variant.toJSONSchema().properties ?? {})
	.filter((key) => !["name", "default", "media"].includes(key));

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

Every one of these ${SEMANTIC_TOKENS.length} keys is required in each variant: ${
			SEMANTIC_TOKENS.join(", ")
		}.

Reference the ramps through the accessor form \`$color.<ramp>.<stop>\` (for example
\`$color.primary.600\`) rather than repeating raw hex, so the variants stay tied to the scales.
Only reference ramps and stops you actually created in pass 1 — a typo'd reference produces CSS
that silently fails to apply rather than an error.

Design the dark variant deliberately instead of inverting the light one. Fills usually want a
bright stop on dark grounds (around 500) and a darker stop on light grounds (around 600), and text
tokens should stay above 4.5:1 against the ground they sit on in both variants. Note that the
\`btn*Bg\` tokens have no matching foreground token, so check that whatever ink the consumer will
put on those fills still reads at the stop you chose.

Finish by calling \`list_current_themes\` to confirm the theme was written, then summarize the
palette: each ramp, its seed, and what it does in the design.`,
});
