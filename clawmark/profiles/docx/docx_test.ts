import { assertEquals } from "@std/assert";
import { xmlToMarkdown } from "../../mod.ts";
import { docxProfile, docxStyleTable } from "./mod.ts";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function doc(body: string): string {
	return `<w:document ${W} ${R}><w:body>${body}</w:body></w:document>`;
}

function para(text: string, style?: string): string {
	const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
	return `<w:p>${pPr}<w:r><w:t>${text}</w:t></w:r></w:p>`;
}

const STYLES = `<w:styles ${W}>
	<w:style w:styleId="Heading1" w:type="paragraph"><w:name w:val="heading 1"/></w:style>
	<w:style w:styleId="Quote" w:type="paragraph"><w:name w:val="Quote"/></w:style>
	<w:style w:styleId="Base"><w:name w:val="Base"/><w:rPr><w:b/></w:rPr></w:style>
	<w:style w:styleId="Derived"><w:name w:val="Derived"/><w:basedOn w:val="Base"/>
		<w:rPr><w:i/></w:rPr></w:style>
	<w:style w:styleId="LoopA"><w:name w:val="LoopA"/><w:basedOn w:val="LoopB"/></w:style>
	<w:style w:styleId="LoopB"><w:name w:val="LoopB"/><w:basedOn w:val="LoopA"/></w:style>
</w:styles>`;

const NUMBERING = `<w:numbering ${W}>
	<w:abstractNum w:abstractNumId="0">
		<w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl>
	</w:abstractNum>
	<w:abstractNum w:abstractNumId="1">
		<w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl>
	</w:abstractNum>
	<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
	<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

const RELS = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
	<Relationship Id="rId4" Target="https://example.com"/>
</Relationships>`;

function run(body: string, parts = {}): string {
	return xmlToMarkdown(doc(body), docxProfile(parts)).trim();
}

// ---- blocks ---------------------------------------------------------------

Deno.test("docx: a styled paragraph becomes a heading", () => {
	assertEquals(run(para("Title", "Heading1"), { styles: STYLES }), "# Title");
	assertEquals(run(para("Sub", "Heading3"), { styles: STYLES }), "### Sub");
});

Deno.test("docx: headings work without styles.xml, via the name heuristic", () => {
	assertEquals(run(para("Title", "Heading2")), "## Title");
});

Deno.test("docx: a plain paragraph", () => {
	assertEquals(run(para("Body text")), "Body text");
});

Deno.test("docx: a quote style becomes a blockquote", () => {
	assertEquals(run(para("Quoted", "Quote"), { styles: STYLES }), "> Quoted");
});

Deno.test("docx: structural noise is dropped", () => {
	assertEquals(
		run(
			`<w:p><w:pPr><w:sectPr/></w:pPr><w:bookmarkStart w:id="1"/>` +
				`<w:r><w:t>x</w:t></w:r></w:p>`,
		),
		"x",
	);
});

// ---- runs -----------------------------------------------------------------

Deno.test("docx: direct run formatting", () => {
	const body = `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r></w:p>`;
	assertEquals(run(body), "**bold**");
});

Deno.test("docx: bold and italic together fold to one marker", () => {
	const body = `<w:p><w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>both</w:t></w:r></w:p>`;
	assertEquals(run(body), "***both***");
});

Deno.test("docx: an explicit off toggle overrides, rather than saying nothing", () => {
	// <w:b w:val="0"/> must produce bold:false, not {} - which is why the style
	// merge has to distinguish undefined from false.
	const body = `<w:p><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>plain</w:t></w:r></w:p>`;
	assertEquals(run(body), "plain");
});

Deno.test("docx: strikethrough", () => {
	const body = `<w:p><w:r><w:rPr><w:strike/></w:rPr><w:t>gone</w:t></w:r></w:p>`;
	assertEquals(run(body), "~~gone~~");
});

Deno.test('docx: xml:space="preserve" keeps deliberate spacing', () => {
	const body = `<w:p><w:r><w:t xml:space="preserve">a </w:t></w:r>` +
		`<w:r><w:rPr><w:b/></w:rPr><w:t>b</w:t></w:r></w:p>`;
	assertEquals(run(body), "a **b**");
});

// ---- lists ----------------------------------------------------------------

function listPara(text: string, level: number, numId: string): string {
	return `<w:p><w:pPr><w:numPr><w:ilvl w:val="${level}"/>` +
		`<w:numId w:val="${numId}"/></w:numPr></w:pPr>` +
		`<w:r><w:t>${text}</w:t></w:r></w:p>`;
}

Deno.test("docx: a run of numPr paragraphs becomes one nested list", () => {
	const body = listPara("a", 0, "1") + listPara("b", 1, "1") + listPara("c", 0, "1");
	assertEquals(run(body, { numbering: NUMBERING }), "- a\n  - b\n- c");
});

Deno.test("docx: numbering.xml decides ordered vs bulleted", () => {
	const body = listPara("a", 0, "2") + listPara("b", 0, "2");
	assertEquals(run(body, { numbering: NUMBERING }), "1. a\n2. b");
});

Deno.test("docx: a list run ends where the list paragraphs stop", () => {
	const body = listPara("a", 0, "1") + para("after");
	assertEquals(run(body, { numbering: NUMBERING }), "- a\n\nafter");
});

// ---- links and tables -----------------------------------------------------

Deno.test("docx: a hyperlink resolves through the relationships part", () => {
	const body = `<w:p><w:hyperlink r:id="rId4"><w:r><w:t>site</w:t></w:r></w:hyperlink></w:p>`;
	assertEquals(run(body, { rels: RELS }), "[site](https://example.com)");
});

Deno.test("docx: a table", () => {
	const cell = (t: string) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
	const body = `<w:tbl><w:tr>${cell("a")}${cell("b")}</w:tr>` +
		`<w:tr>${cell("1")}${cell("2")}</w:tr></w:tbl>`;
	assertEquals(run(body), "|a|b|\n|:-|:-|\n|1|2|");
});

// ---- the style table ------------------------------------------------------

Deno.test("docx: basedOn chains flatten, most-derived wins", () => {
	const table = docxStyleTable(STYLES);
	const derived = table.resolve("Derived");
	assertEquals(derived.bold, true);
	assertEquals(derived.italic, true);
});

Deno.test("docx: a basedOn cycle terminates instead of hanging", () => {
	const table = docxStyleTable(STYLES);
	assertEquals(typeof table.resolve("LoopA"), "object");
});

Deno.test("docx: a localized styleId still resolves via its English name", () => {
	// Word on a German install writes w:styleId="Uberschrift1" with an English
	// w:name. Indexing only the id would lose every heading.
	const styles = `<w:styles ${W}><w:style w:styleId="Uberschrift1">` +
		`<w:name w:val="heading 1"/></w:style></w:styles>`;
	assertEquals(run(para("Titel", "Uberschrift1"), { styles }), "# Titel");
});
