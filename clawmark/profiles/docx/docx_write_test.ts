import { assertEquals, assertStringIncludes } from "@std/assert";
import { markdownWith, parse, toMarkdown, xmlToMarkdown } from "../../mod.ts";
import { docxProfile, docxStyleTable, docxWriter } from "./mod.ts";
import { createDocumentStyles } from "../../format.ts";
import { renderWith } from "../../write.ts";
import type { Node } from "../../types.ts";

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

Deno.test("docx write: a horizontal rule has room below it", () => {
	// Same reasoning as the odt writer's: the space above the line is the empty
	// paragraph's own line box, so the rule needs a matching space below it or it
	// reads as attached to the paragraph that follows.
	const part = write("a\n\n---\n\nb")["word/document.xml"];
	const hr = part.slice(part.indexOf("<w:pBdr>"));

	assertStringIncludes(hr.slice(0, hr.indexOf("</w:pPr>")), '<w:spacing w:after="240"/>');
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

// ---- caller-defined styles ------------------------------------------------

const NOVEL = createDocumentStyles()
	.define("Scene Break", {
		align: "c",
		spaceBefore: "1.5em",
		fontStyle: "italic",
		letterSpacing: "0.3em",
		keepWithNext: true,
	})
	.define("Chapter Title", {
		role: "heading",
		headingLevel: 1,
		breakBefore: "page",
		align: "c",
		spaceAfter: "2em",
		fontSize: "24pt",
		fontFamily: '"EB Garamond", serif',
		color: "#334455",
	})
	.define("Thought", { family: "text", fontStyle: "italic" })
	.bind("graver:scenebreak", "Scene Break")
	.bind("graver:thought", "Thought");

function tree(...children: Node[]): Node {
	const root: Node = { tag: "core:root", data: {}, children };
	for (const child of children) child.parent = root;
	return root;
}

function node(tag: string, children: Node[] = [], data: Record<string, unknown> = {}): Node {
	const self: Node = { tag: tag as Node["tag"], data, children };
	for (const child of children) child.parent = self;
	return self;
}

const text = (value: string) => node("core:text", [], { value });

Deno.test("docx write: a registered style is a document-wide definition", () => {
	const parts = markdownWith("hi", docxWriter({ styles: NOVEL })).parts;
	const styles = parts["word/styles.xml"];

	// Defined once, with the display name intact and in `w:val` - as element
	// text it parses but leaves the style unnamed in Word's style gallery.
	assertEquals(styles.split('w:styleId="SceneBreak"').length - 1, 1);
	assertStringIncludes(styles, '<w:name w:val="Scene Break"/>');
	assertStringIncludes(styles, '<w:jc w:val="center"/>');
	// 1.5em at the default 12pt base is 18pt, which is 360 twips.
	assertStringIncludes(styles, '<w:spacing w:before="360"/>');
	// 24pt is 48 half-points.
	assertStringIncludes(styles, '<w:sz w:val="48"/>');
	assertStringIncludes(styles, '<w:color w:val="334455"/>');
	// A font stack collapses to its head; docx names exactly one font.
	assertStringIncludes(styles, 'w:ascii="EB Garamond"');
	// A character style carries no `<w:pPr>` at all.
	assertStringIncludes(
		styles,
		'<w:style w:type="character" w:styleId="Thought"><w:name w:val="Thought"/><w:rPr><w:i/></w:rPr></w:style>',
	);
});

Deno.test("docx write: <w:pPr> children keep their schema order", () => {
	// CT_PPrBase is a sequence, not a bag: keepNext, pageBreakBefore, spacing,
	// ind, jc, outlineLvl. Word rejects a document that scrambles it.
	const styles = markdownWith("hi", docxWriter({ styles: NOVEL })).parts["word/styles.xml"];
	const scene = styles.slice(styles.indexOf('w:styleId="SceneBreak"'));
	const order = [...scene.slice(0, scene.indexOf("</w:pPr>")).matchAll(/<w:(\w+)[ />]/g)]
		.map((m) => m[1])
		.filter((name) => name !== "pPr" && name !== "name" && name !== "style");

	assertEquals(order, ["keepNext", "spacing", "jc"]);

	const chapter = styles.slice(styles.indexOf('w:styleId="ChapterTitle"'));
	const chapterOrder = [...chapter.slice(0, chapter.indexOf("</w:pPr>")).matchAll(/<w:(\w+)[ />]/g)]
		.map((m) => m[1])
		.filter((name) => name !== "pPr" && name !== "name" && name !== "style");
	assertEquals(chapterOrder, ["pageBreakBefore", "spacing", "jc", "outlineLvl"]);
});

Deno.test("docx write: a bound node references its style and carries no direct formatting", () => {
	const parts = renderWith(
		tree(node("graver:scenebreak", [text("* * *")])),
		docxWriter({ styles: NOVEL }),
	).parts;

	assertStringIncludes(
		parts["word/document.xml"],
		'<w:p><w:pPr><w:pStyle w:val="SceneBreak"/></w:pPr><w:r><w:t xml:space="preserve">* * *</w:t></w:r></w:p>',
	);
});

Deno.test("docx write: an inline style becomes a run style, not a paragraph style", () => {
	const parts = renderWith(
		tree(node("core:paragraph", [node("graver:thought", [text("no")])])),
		docxWriter({ styles: NOVEL }),
	).parts;

	assertStringIncludes(
		parts["word/document.xml"],
		'<w:rPr><w:rStyle w:val="Thought"/></w:rPr>',
	);
});

Deno.test("docx write: binding a known tag restyles it without nesting paragraphs", () => {
	const styles = createDocumentStyles()
		.define("Verse", { fontStyle: "italic", indentLeft: "2em" })
		.bind("md:blockquote", "Verse");
	const document = markdownWith("> a line\n", docxWriter({ styles })).parts["word/document.xml"];

	assertStringIncludes(document, '<w:pStyle w:val="Verse"/>');
	// One paragraph, not a `<w:p>` inside a `<w:p>`.
	assertEquals(document.split("<w:p>").length - 1, 1);
});

Deno.test("docx write: a registered style replaces the built-in it collides with", () => {
	const styles = createDocumentStyles().define("Quote", { indentLeft: "3cm" });
	const part = markdownWith("hi", docxWriter({ styles })).parts["word/styles.xml"];

	assertEquals(part.split('w:styleId="Quote"').length - 1, 1);
	// 3cm is 85.04pt, so 1701 twips - the built-in's 720 is gone.
	assertStringIncludes(part, '<w:ind w:left="1701"/>');
	assertEquals(part.includes('<w:ind w:left="720"/>'), false);
});

Deno.test("docx write: the styles part is self-describing to the reader", () => {
	// The body references the style by name only, so everything about it has to
	// be recoverable from `word/styles.xml` alone - otherwise a document written
	// here and read back somewhere else loses the style entirely.
	const parts = markdownWith("hi", docxWriter({ styles: NOVEL })).parts;
	const table = docxStyleTable(parts["word/styles.xml"]);

	assertEquals(table.resolve("SceneBreak").italic, true);
	assertEquals(table.resolve("SceneBreak").align, "c");
	assertEquals(table.resolve("ChapterTitle").blockRole, "heading");
	assertEquals(table.resolve("ChapterTitle").headingLevel, 1);
	// Indexed by display name too, which is what a non-English Word writes.
	assertEquals(table.resolve("Scene Break").italic, true);
});
