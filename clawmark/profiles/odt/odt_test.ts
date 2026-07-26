import { assertEquals } from "@std/assert";
import { xmlToMarkdown } from "../../mod.ts";
import { odtProfile, odtStyleTable } from "./mod.ts";

const NS = [
	'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
	'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
	'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
	'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
	'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
	'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
	'xmlns:xlink="http://www.w3.org/1999/xlink"',
].join(" ");

/** `<office:automatic-styles>`: T1 bold, T2 inherits T1 and adds italic. */
const AUTOMATIC = `<office:automatic-styles>
	<style:style style:name="T1"><style:text-properties fo:font-weight="bold"/></style:style>
	<style:style style:name="T2" style:parent-style-name="T1">
		<style:text-properties fo:font-style="italic"/></style:style>
	<style:style style:name="T3">
		<style:text-properties style:text-line-through-style="solid"/></style:style>
	<style:style style:name="T4">
		<style:text-properties style:text-underline-style="solid"/></style:style>
	<style:style style:name="T5">
		<style:text-properties style:text-underline-style="solid" fo:font-weight="bold" fo:font-style="italic"/></style:style>
	<style:style style:name="P1" style:family="paragraph">
		<style:text-properties fo:font-style="italic"/></style:style>
	<style:style style:name="P6" style:family="paragraph" style:parent-style-name="Heading_20_1"/>
	<style:style style:name="Title" style:family="paragraph" style:default-outline-level=""/>
	<style:style style:name="Subtitle" style:family="paragraph"/>
	<style:style style:name="Heading_20_1" style:family="paragraph" style:default-outline-level=""/>
	<style:style style:name="Heading_20_3" style:family="paragraph"/>
	<style:style style:name="HX" style:family="paragraph" style:default-outline-level="4"/>
	<text:list-style style:name="L1"><text:list-level-style-bullet text:level="1"/></text:list-style>
	<text:list-style style:name="L2"><text:list-level-style-number text:level="1"/></text:list-style>
	<text:list-style style:name="L3">
		<text:list-level-style-bullet text:level="1"/>
		<text:list-level-style-number text:level="10"/>
	</text:list-style>
	<text:list-style style:name="L4">
		<text:list-level-style-bullet text:level="1"/>
		<text:list-level-style-number text:level="2"/>
	</text:list-style>
</office:automatic-styles>`;

function content(body: string): string {
	return `<office:document-content ${NS}>${AUTOMATIC}` +
		`<office:body><office:text>${body}</office:text></office:body></office:document-content>`;
}

function run(body: string): string {
	const source = content(body);
	return xmlToMarkdown(source, odtProfile({ content: source })).trim();
}

// ---- blocks ---------------------------------------------------------------

Deno.test("odt: text:h uses its outline level directly", () => {
	assertEquals(run(`<text:h text:outline-level="1">Title</text:h>`), "# Title");
	assertEquals(run(`<text:h text:outline-level="3">Sub</text:h>`), "### Sub");
});

Deno.test("odt: a plain paragraph", () => {
	assertEquals(run("<text:p>Body</text:p>"), "Body");
});

Deno.test("odt: heading-styled paragraphs become headings", () => {
	// Google Docs exports write no <text:h> at all - headings are styled
	// paragraphs whose default-outline-level is *empty*, so the level comes
	// from the style name heuristics.
	assertEquals(run(`<text:p text:style-name="Title">The Book</text:p>`), "# The Book");
	assertEquals(run(`<text:p text:style-name="Subtitle">Sub</text:p>`), "## Sub");
	assertEquals(run(`<text:p text:style-name="Heading_20_3">Scene</text:p>`), "### Scene");
});

Deno.test("odt: a non-empty default-outline-level beats the name heuristic", () => {
	assertEquals(run(`<text:p text:style-name="HX">Deep</text:p>`), "#### Deep");
});

Deno.test("odt: parent-style-name chains into heading styles", () => {
	// The automatic P6 style is what the paragraph references; the heading
	// role comes from its parent, Heading_20_1.
	assertEquals(run(`<text:p text:style-name="P6">Chapter</text:p>`), "# Chapter");
});

Deno.test("odt: a paragraph style's character formatting wraps the paragraph", () => {
	assertEquals(run(`<text:p text:style-name="P1">thought</text:p>`), "*thought*");
});

Deno.test("odt: two paragraphs are separated", () => {
	assertEquals(run("<text:p>a</text:p><text:p>b</text:p>"), "a\n\nb");
});

// ---- character styles -----------------------------------------------------

Deno.test("odt: a span resolves its automatic character style", () => {
	assertEquals(
		run(`<text:p><text:span text:style-name="T1">bold</text:span></text:p>`),
		"**bold**",
	);
});

Deno.test("odt: parent-style-name cascades, so T2 is bold and italic", () => {
	assertEquals(
		run(`<text:p><text:span text:style-name="T2">both</text:span></text:p>`),
		"***both***",
	);
});

Deno.test("odt: strikethrough", () => {
	assertEquals(
		run(`<text:p><text:span text:style-name="T3">gone</text:span></text:p>`),
		"~~gone~~",
	);
});

Deno.test("odt: underline", () => {
	assertEquals(
		run(`<text:p><text:span text:style-name="T4">under</text:span></text:p>`),
		"++under++",
	);
});

Deno.test("odt: a span carrying several formattings keeps them all", () => {
	assertEquals(
		run(`<text:p><text:span text:style-name="T5">all</text:span></text:p>`),
		"++***all***++",
	);
});

Deno.test("odt: an unstyled span is transparent", () => {
	assertEquals(run(`<text:p>a <text:span>b</text:span></text:p>`), "a b");
});

// ---- lists ----------------------------------------------------------------

Deno.test("odt: a nested list", () => {
	const body = `<text:list text:style-name="L1">
		<text:list-item><text:p>a</text:p>
			<text:list text:style-name="L1"><text:list-item><text:p>b</text:p></text:list-item></text:list>
		</text:list-item>
		<text:list-item><text:p>c</text:p></text:list-item>
	</text:list>`;
	assertEquals(run(body), "- a\n  - b\n- c");
});

Deno.test("odt: a numbered list style makes an ordered list", () => {
	const body = `<text:list text:style-name="L2">` +
		`<text:list-item><text:p>a</text:p></text:list-item>` +
		`<text:list-item><text:p>b</text:p></text:list-item></text:list>`;
	assertEquals(run(body), "1. a\n2. b");
});

Deno.test("odt: a deep numbered level does not turn a bulleted list ordered", () => {
	// Google Docs defines all ten levels of a bulleted list style and makes
	// the deepest one numbered; only the level in use may decide the kind.
	const body = `<text:list text:style-name="L3">` +
		`<text:list-item><text:p>a</text:p></text:list-item></text:list>`;
	assertEquals(run(body), "- a");
});

Deno.test("odt: list kind is resolved per nesting level", () => {
	// The inner list carries no style-name of its own - the nearest named
	// ancestor list supplies it, and level 2 of L4 is numbered.
	const body = `<text:list text:style-name="L4">
		<text:list-item><text:p>a</text:p>
			<text:list><text:list-item><text:p>b</text:p></text:list-item></text:list>
		</text:list-item>
	</text:list>`;
	assertEquals(run(body), "- a\n  1. b");
});

Deno.test("odt: a paragraph style's formatting applies inside list items", () => {
	const body = `<text:list text:style-name="L1">` +
		`<text:list-item><text:p text:style-name="P1">a</text:p></text:list-item>` +
		`<text:list-item><text:p text:style-name="P1">b</text:p></text:list-item></text:list>`;
	assertEquals(run(body), "- *a*\n- *b*");
});

// ---- inline oddities ------------------------------------------------------

Deno.test("odt: text:s expands to literal spaces", () => {
	assertEquals(run(`<text:p>a<text:s text:c="3"/>b</text:p>`), "a   b");
});

Deno.test("odt: a line break", () => {
	assertEquals(run(`<text:p>a<text:line-break/>b</text:p>`), "a\\\nb");
});

Deno.test("odt: a hyperlink", () => {
	assertEquals(
		run(`<text:p><text:a xlink:href="https://example.com">site</text:a></text:p>`),
		"[site](https://example.com)",
	);
});

Deno.test("odt: an image", () => {
	assertEquals(
		run(`<text:p><draw:frame><draw:image xlink:href="pic.png"/></draw:frame></text:p>`),
		"![](pic.png)",
	);
});

// ---- tables ---------------------------------------------------------------

Deno.test("odt: a table", () => {
	const cell = (t: string) => `<table:table-cell><text:p>${t}</text:p></table:table-cell>`;
	const body = `<table:table><table:table-row>${cell("a")}${cell("b")}</table:table-row>` +
		`<table:table-row>${cell("1")}${cell("2")}</table:table-row></table:table>`;
	assertEquals(run(body), "|a|b|\n|:-|:-|\n|1|2|");
});

// ---- the style table ------------------------------------------------------

Deno.test("odt: the style table indexes automatic styles by name", () => {
	const table = odtStyleTable(content(""));
	assertEquals(table.resolve("T1").bold, true);
	assertEquals(table.resolve("T2").italic, true);
	assertEquals(table.resolve("T2").bold, true);
});

Deno.test("odt: the crawled document's automatic styles are harvested mid-crawl", () => {
	// No `content` part - the profile must pick up T1 and L2 from the
	// document itself, which is how `odtProfile({ styles })` stays correct.
	const source = content(
		`<text:p><text:span text:style-name="T1">bold</text:span></text:p>` +
			`<text:list text:style-name="L2"><text:list-item><text:p>a</text:p></text:list-item></text:list>`,
	);
	assertEquals(xmlToMarkdown(source, odtProfile()).trim(), "**bold**\n\n1. a");
});
