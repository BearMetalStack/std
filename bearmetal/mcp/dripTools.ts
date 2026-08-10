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
const colorString = s.string().regex(
	/\w+(-\w+)*:#[a-f0-9]{3}|[a-f0-9]{6}(:(50|[1-9]00|950))?/i,
	"Color provided in incorrect format (expected hex code)",
);
server.addTool({
	name: "create_theme",
	description: "Creates a Drip theme from seed colors",
	inputSchema: s.object({
		themeName: s.string(),
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
				stop: s.string().regex(/[1-9]00|9?50/, "Not a valid color stop").describe(
					"The stop to use for the color",
				),
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
		const themeFile = await dotBearmetalFile(namespaces.themes, themeName + ".theme.json");
		const theme = await themeFile.readJson<Theme>();
		for (const { identity, name, stop, useProportionalScale, manualStops } of colors) {
			if (manualStops) {
				let current = (theme.color ??= {}) as Theme;
				current = name.split("-").reduce(
					(acc, part) => ((acc as Theme)[part] ??= {}) as Theme,
					current,
				);
				for (const { color, stop } of manualStops) {
					current[stop] = color;
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
		return `Created theme ${themeName} with ${colors.length} colors`;
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
	media: s.string().describe("Media query that triggers variant automatically (without `@media`)")
		.optional(),
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
		variant: Variant.describe(
			"Theme variant definitions. Provide colors either as raw CSS values or use Drip's accessor format (`$<namespace>.path.to.property`, e.g. `$color.info.muted.300`)",
		),
	}),
	handler: async ({ theme, variant }) => {
		const { name, media, default: isDefault, ...rules } = variant;
		const themeFile = await dotBearmetalFile(namespaces.themes, theme + ".theme.json");
		const themeData = await themeFile.readJson<Theme>();
		const variants = themeData["#variants"] ??= [];
		if (isDefault) {
			const existingDefault = variants.find((v) => v.default);
			if (existingDefault) throw new Error("Theme already has a default variant");
		}
		const variantRules: Record<string, string> = {};
		for (const [key, value] of Object.entries(rules)) {
			if (!value) continue;
			let name = toKebabCase(key);
			if (!name.startsWith("btn") && !name.startsWith("toast")) name = "color-" + name;
			name = "--" + name;
			variantRules[name] = parseDripValue(value);
		}
		variants.push({
			name,
			default: isDefault,
			rules: variantRules,
			media,
		});
		themeFile.writeJson(themeData);
		return `Theme variant '${name}' added to ${theme}`;
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
