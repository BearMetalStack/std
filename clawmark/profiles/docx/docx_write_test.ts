import { assertEquals, assertStringIncludes } from "@std/assert";
import { markdownWith, parse, toMarkdown, xmlToMarkdown } from "../../mod.ts";
import { docxProfile, docxWriter } from "./mod.ts";

function write(md: string): Record<string, string> {
	return markdownWith(md, docxWriter()).parts;
}

/** md -> docx parts -> md, reading back through the profile's own output. */
function round(md: string): string {
	const parts = write(md);
	return xmlToMarkdown(
		parts["word/document.xml"],
		docxProfile({
			styles: parts["word/styles.xml"],
			numbering: parts["word/numbering.xml"],
			rels: parts["word/_rels/document.xml.rels"],
			footnotes: parts["word/footnotes.xml"],
		}),
	).trim();
}

/**
 * The write direction must not lose anything the tree already holds, so the
 * target is the engine's *own* fixed point rather than the source text.
 * Comparing against the input instead would fold in the forward engine's known
 * lossiness (`_a_` -> `*a*`, ordinal discarding, the `---`-at-EOF quirk) and
 * blame the writer for it - see the README's round-trip table.
 */
function assertStable(md: string) {
	assertEquals(round(md), toMarkdown(parse(md)).trim());
}

// ---- construct inventory --------------------------------------------------

Deno.test("docx write: paragraphs", () => {
	assertStable("Hello world");
	assertStable("First\n\nSecond");
});

Deno.test("docx write: headings", () => {
	assertStable("# One");
	assertStable("#### Four");
	assertStable("###### Six");
	assertStable("# Title\n\nBody text");
});

Deno.test("docx write: inline emphasis", () => {
	assertStable("plain **bold** text");
	assertStable("*italic* and **bold** and ***both***");
	assertStable("~~strike~~ and ++under++ and ==mark==");
});

Deno.test("docx write: emphasis inside emphasis flattens to sibling runs", () => {
	// A docx run cannot contain another run - `<w:b/>` and `<w:i/>` are siblings
	// inside one `<w:rPr>` - so `**b *c* d**` becomes three runs with different
	// properties, and reads back as three siblings rather than one nesting.
	// It renders identically; only the markdown spelling differs. ODF spans do
	// nest, which is why odt keeps this and docx cannot.
	assertEquals(round("a **b *c* d** e"), "a **b *****c***** d** e");
});

Deno.test("docx write: code", () => {
	assertStable("use `code` inline");
	assertStable("```\nlet x = 1;\nlet y = 2;\n```");
});

Deno.test("docx write: blockquote", () => {
	assertStable("> quoted line");
	assertStable("> quoted line\n> second line");
});

Deno.test("docx write: lists", () => {
	assertStable("- a\n- b");
	assertStable("- a\n- b\n  - nested");
	assertStable("1. one\n2. two");
});

Deno.test("docx write: table", () => {
	assertStable("| a | b |\n| --- | --- |\n| 1 | 2 |");
});

Deno.test("docx write: links, images, breaks, rules", () => {
	assertStable("[text](http://x.com)");
	assertStable("![alt](img.png)");
	assertStable("a\\\nb");
	assertStable("a\n\n---\n\nb");
});

Deno.test("docx write: footnotes", () => {
	assertStable("ref[^1]\n\n[^1]: the note");
	assertStable("one[^1] and two[^2]\n\n[^1]: first\n\n[^2]: second");
});

// ---- the shape of what is produced ----------------------------------------

Deno.test("docx write: emits the parts a package needs", () => {
	const parts = write("# Hello");
	assertEquals(
		Object.keys(parts).sort(),
		[
			"[Content_Types].xml",
			"_rels/.rels",
			"word/_rels/document.xml.rels",
			"word/document.xml",
			"word/numbering.xml",
			"word/styles.xml",
		],
	);
	const result = markdownWith("# Hello", docxWriter());
	assertEquals(result.primary, "word/document.xml");
	assertEquals(result.extension, "docx");
});

Deno.test("docx write: footnotes.xml appears only when there are footnotes", () => {
	assertEquals("word/footnotes.xml" in write("plain"), false);
	const parts = write("ref[^1]\n\n[^1]: the note");
	assertStringIncludes(parts["word/footnotes.xml"], 'w:id="1"');
	assertStringIncludes(parts["[Content_Types].xml"], "footnotes.xml");
	assertStringIncludes(parts["word/_rels/document.xml.rels"], "footnotes.xml");
});

Deno.test("docx write: headings reference the styles the part defines", () => {
	const parts = write("## Two");
	assertStringIncludes(parts["word/document.xml"], '<w:pStyle w:val="Heading');
	assertStringIncludes(parts["word/styles.xml"], 'w:styleId="Heading2"');
});

Deno.test("docx write: a run carries every formatting at once", () => {
	// The tree nests md:bold > md:underline; docx must flatten that to one rPr.
	const xml = write("**++both++**")["word/document.xml"];
	assertStringIncludes(xml, '<w:rPr><w:b/><w:u w:val="single"/></w:rPr>');
});

Deno.test("docx write: text keeps its spacing verbatim", () => {
	assertStringIncludes(
		write("plain **bold** text")["word/document.xml"],
		'<w:t xml:space="preserve">plain </w:t>',
	);
});

Deno.test("docx write: each list mints its own numbering instance", () => {
	const parts = write("- a\n\n1. one");
	assertStringIncludes(parts["word/numbering.xml"], '<w:num w:numId="1">');
	assertStringIncludes(parts["word/numbering.xml"], '<w:num w:numId="2">');
	// numId 1 is the bulleted abstract definition, numId 2 the numbered one.
	assertStringIncludes(
		parts["word/numbering.xml"],
		'<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>',
	);
	assertStringIncludes(
		parts["word/numbering.xml"],
		'<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>',
	);
});

Deno.test("docx write: a hyperlink becomes an external relationship", () => {
	const parts = write("[text](http://x.com)");
	assertStringIncludes(parts["word/document.xml"], '<w:hyperlink r:id="rId1">');
	assertStringIncludes(
		parts["word/_rels/document.xml.rels"],
		'Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="http://x.com" TargetMode="External"',
	);
});

Deno.test("docx write: a non-numeric footnote label is renumbered, with a warning", () => {
	const result = markdownWith("ref[^note]\n\n[^note]: text", docxWriter());
	assertEquals(result.warnings.length, 1);
	assertStringIncludes(result.warnings[0], "not numeric");
});
