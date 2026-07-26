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
	<text:list-style style:name="L1"><text:list-level-style-bullet text:level="1"/></text:list-style>
	<text:list-style style:name="L2"><text:list-level-style-number text:level="1"/></text:list-style>
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
