import { assertEquals, assertStringIncludes } from "@std/assert";
import { declarationsFor, parseDeclarations, parseStyleSheet, toCss } from "./css.ts";
import { createDocumentStyles } from "./format.ts";
import type { StyleBlock } from "./types.ts";

function parseOne(source: string): StyleBlock {
	const rules = parseStyleSheet(source);
	assertEquals(rules.length, 1);
	return rules[0][1];
}

// ---- declarations ---------------------------------------------------------

Deno.test("css: declaration parsing", () => {
	const decls = parseDeclarations("color: red; FONT-SIZE : 12pt ;");
	assertEquals(decls.get("color"), "red");
	// Property names fold to lowercase, values keep their case.
	assertEquals(decls.get("font-size"), "12pt");
	assertEquals(parseDeclarations(undefined).size, 0);
});

Deno.test("css: a comma inside a value does not split it", () => {
	// This is the bug the old inline-style parser had: it split on every `;`
	// and let `split(",")` callers see a font stack in pieces.
	const decls = parseDeclarations(`font-family: "Foo, Bar", serif; color: rgb(1, 2, 3)`);
	assertEquals(decls.get("font-family"), `"Foo, Bar", serif`);
	assertEquals(decls.get("color"), "rgb(1, 2, 3)");
});

Deno.test("css: !important is stripped", () => {
	assertEquals(parseDeclarations("color: red !important").get("color"), "red");
});

// ---- stylesheet -> blocks -------------------------------------------------

Deno.test("css: a class rule becomes a named style", () => {
	const rules = parseStyleSheet(".scene-break { text-align: center }");
	assertEquals(rules.length, 1);
	assertEquals(rules[0][0], "SceneBreak");
	assertEquals(rules[0][1].className, "scene-break");
	assertEquals(rules[0][1].align, "c");
});

Deno.test("css: the supported property vocabulary", () => {
	const block = parseOne(`
		.x {
			font-family: Garamond;
			font-size: 24pt;
			font-weight: 700;
			font-style: italic;
			font-variant: small-caps;
			color: #334455;
			background-color: #ffff00;
			text-transform: uppercase;
			letter-spacing: 0.3em;
			text-decoration: underline line-through;
			text-align: justify;
			line-height: 1.5;
			margin-top: 1em;
			margin-bottom: 2em;
			margin-left: 3em;
			margin-right: 4em;
			text-indent: -1em;
			break-before: page;
			break-inside: avoid;
			widows: 2;
		}
	`);

	assertEquals(block.fontFamily, "Garamond");
	assertEquals(block.fontSize, "24pt");
	assertEquals(block.fontWeight, 700);
	assertEquals(block.fontStyle, "italic");
	assertEquals(block.smallCaps, true);
	assertEquals(block.color, "#334455");
	assertEquals(block.background, "#ffff00");
	assertEquals(block.textTransform, "uppercase");
	assertEquals(block.letterSpacing, "0.3em");
	assertEquals(block.underline, true);
	assertEquals(block.strike, true);
	assertEquals(block.align, "j");
	assertEquals(block.lineHeight, 1.5);
	assertEquals(block.spaceBefore, "1em");
	assertEquals(block.spaceAfter, "2em");
	assertEquals(block.indentLeft, "3em");
	assertEquals(block.indentRight, "4em");
	assertEquals(block.textIndent, "-1em");
	assertEquals(block.breakBefore, "page");
	assertEquals(block.keepTogether, true);
	assertEquals(block.widowControl, true);
});

Deno.test("css: break-after: avoid means keep-with-next", () => {
	const block = parseOne(".x { break-after: avoid }");
	assertEquals(block.keepWithNext, true);
	assertEquals(block.breakAfter, undefined);
	// The real break kinds still land on breakAfter.
	assertEquals(parseOne(".x { break-after: column }").breakAfter, "column");
});

Deno.test("css: the margin shorthand expands to four sides", () => {
	assertEquals(parseOne(".x { margin: 1em }").spaceBefore, "1em");
	assertEquals(parseOne(".x { margin: 1em }").indentRight, "1em");

	const two = parseOne(".x { margin: 1em 2em }");
	assertEquals(two.spaceBefore, "1em");
	assertEquals(two.spaceAfter, "1em");
	assertEquals(two.indentLeft, "2em");
	assertEquals(two.indentRight, "2em");

	const four = parseOne(".x { margin: 1pt 2pt 3pt 4pt }");
	assertEquals(four.spaceBefore, "1pt");
	assertEquals(four.indentRight, "2pt");
	assertEquals(four.spaceAfter, "3pt");
	assertEquals(four.indentLeft, "4pt");
});

Deno.test("css: clawmark's own properties ride as custom properties", () => {
	const block = parseOne(`
		.chapter {
			--clawmark-role: heading;
			--clawmark-element: h2;
			--clawmark-next: body-text;
			--clawmark-based-on: base-style;
		}
	`);
	assertEquals(block.role, "heading");
	assertEquals(block.element, "h2");
	assertEquals(block.nextStyle, "BodyText");
	assertEquals(block.basedOn, "BaseStyle");
	assertEquals(parseOne(".x { --clawmark-family: text }").family, "text");
});

Deno.test("css: a tag-qualified selector sets the element", () => {
	assertEquals(parseOne("blockquote.verse { font-style: italic }").element, "blockquote");
});

Deno.test("css: one rule, several selectors", () => {
	const rules = parseStyleSheet(".a, .b { text-align: center }");
	assertEquals(rules.map(([name]) => name), ["A", "B"]);
});

Deno.test("css: comments are stripped", () => {
	const block = parseOne(`/* leading */ .x { /* inner */ text-align: center /* trailing */ }`);
	assertEquals(block.align, "c");
});

Deno.test("css: unsupported declarations survive to CSS output only", () => {
	const block = parseOne(".x { box-shadow: 0 0 2px red; text-align: center }");
	assertEquals(block.align, "c");
	assertEquals(block.css, { "box-shadow": "0 0 2px red" });
});

Deno.test("css: unsupported selectors and at-rules warn and are skipped", () => {
	const warnings: string[] = [];
	const rules = parseStyleSheet(
		`@media print { .a { color: red } }
		 .b .c { color: red }
		 .ok { color: red }`,
		{ onWarn: (m) => warnings.push(m) },
	);

	assertEquals(rules.map(([name]) => name), ["Ok"]);
	assertEquals(warnings.length, 2);
	assertStringIncludes(warnings[0], "@media");
	assertStringIncludes(warnings[1], ".b .c");
});

// ---- blocks -> stylesheet -------------------------------------------------

Deno.test("css: toCss regenerates a parsed stylesheet", () => {
	const source = `
		.scene-break { text-align: center; margin-top: 1.5em; font-style: italic }
		.chapter-title { break-before: page; font-size: 24pt }
	`;
	const styles = createDocumentStyles().fromCss(source);
	const out = toCss(styles);

	// Reparsing the generated sheet yields the same blocks it came from.
	const original = new Map(parseStyleSheet(source));
	for (const [name, block] of parseStyleSheet(out)) {
		assertEquals(declarationsFor(block), declarationsFor(original.get(name)!));
	}
});

Deno.test("css: toCss flattens basedOn, because CSS classes do not inherit", () => {
	const styles = createDocumentStyles()
		.define("Body", { fontFamily: "Garamond" })
		.define("Verse", { basedOn: "Body", fontStyle: "italic" });

	const out = toCss(styles);
	const verse = parseStyleSheet(out).find(([name]) => name === "Verse")![1];
	assertEquals(verse.fontFamily, "Garamond");
	assertEquals(verse.fontStyle, "italic");
});

Deno.test("css: toCss carries unsupported declarations through", () => {
	const styles = createDocumentStyles().fromCss(".x { box-shadow: 0 0 2px red }");
	assertStringIncludes(toCss(styles), "box-shadow: 0 0 2px red;");
});

Deno.test("css: classPrefix namespaces every rule", () => {
	const styles = createDocumentStyles().define("SceneBreak", { align: "c" });
	assertStringIncludes(toCss(styles, { classPrefix: "gv-" }), ".gv-scene-break {");
});

Deno.test("css: a registry with nothing to say emits no stylesheet", () => {
	assertEquals(toCss(createDocumentStyles()), "");
	// A style with no formatting is not worth a rule either.
	assertEquals(toCss(createDocumentStyles().define("Empty", {})), "");
});

Deno.test("css: CSS layered over an object definition merges", () => {
	const styles = createDocumentStyles()
		.define("SceneBreak", { role: "quote", align: "c" })
		.fromCss(".scene-break { font-style: italic }");

	const block = styles.resolve("SceneBreak");
	// The structural half declared in TypeScript survives...
	assertEquals(block.role, "quote");
	// ...and the stylesheet's appearance is layered on top.
	assertEquals(block.fontStyle, "italic");
});
