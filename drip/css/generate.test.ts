import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { cssFromJson, themeCSS } from "./generate.ts";
import type { Theme } from "../types.ts";

function theme(): Theme {
	return {
		color: { brand: { "500": "#6633cc", base: "#6633cc" } },
		btn: { primary: { bg: { $ref: "$color.interactive" } }, radius: "4px" },
		variants: [
			{ name: "light", default: true, rules: { "--color-interactive": "#6633cc" } },
			{ name: "dark", rules: { "--color-interactive": "#bb99ff" } },
		],
	};
}

/** The body of the first rule whose selector is exactly `selector`. */
function block(css: string, selector: string): string | undefined {
	const start = css.indexOf(`\n${selector} {`);
	if (start === -1 && !css.startsWith(`${selector} {`)) return undefined;
	const open = css.indexOf("{", start);
	return css.slice(open + 1, css.indexOf("}", open));
}

for (
	const [label, render] of [
		["cssFromJson", (t: Theme, s: string) => cssFromJson(t, { scope: s, validate: false })],
		["themeCSS", (t: Theme, s: string) => themeCSS(t, s)],
	] as const
) {
	Deno.test(`${label}: derived tokens are re-declared on [data-theme] under :root`, () => {
		const derived = block(render(theme(), ":root"), "[data-theme]");
		assert(derived, "no [data-theme] block");
		assertStringIncludes(derived, "--btn-primary-bg: var(--color-interactive);");
		// A literal resolves the same everywhere; re-declaring it is only noise.
		assert(!derived.includes("--btn-radius"), derived);
		assert(!derived.includes("--color-brand-500"), derived);
	});

	Deno.test(`${label}: the [data-theme] block comes before the variant blocks`, () => {
		const css = render(theme(), ":root");
		// Equal specificity, so order decides; a variant must never lose to it.
		assert(css.indexOf("\n[data-theme] {") < css.indexOf('[data-theme="dark"]'));
	});

	Deno.test(`${label}: a scope other than :root gets no [data-theme] block`, () => {
		// Its variants only match elements that already carry the scope's tokens.
		assertEquals(block(render(theme(), ".app"), "[data-theme]"), undefined);
	});
}
