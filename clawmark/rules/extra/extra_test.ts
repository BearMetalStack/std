import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { fromHtml, markdownWith, parse, toHtml, toMarkdown } from "../../mod.ts";
import { defaultRules } from "../mod.ts";
import { isBlockTag } from "../paragraph.ts";
import { odtProfile, odtWriter } from "../../profiles/odt/mod.ts";
import { docxProfile, docxWriter } from "../../profiles/docx/mod.ts";
import { xmlToMarkdown } from "../../mod.ts";
import { PAGE_BREAK_TAG, pageBreakRules } from "./mod.ts";
import type { Node } from "../../types.ts";

const rules = () => [...pageBreakRules(), ...defaultRules()];

function tags(node: Node, out: string[] = []): string[] {
	out.push(node.tag);
	for (const child of node.children) tags(child, out);
	return out;
}

// ---- parsing --------------------------------------------------------------

Deno.test("pagebreak: the default markers parse to a block-level node", () => {
	for (const marker of ["\\pagebreak", "\\newpage"]) {
		const tree = parse(`a\n\n${marker}\n\nb`, rules());
		assertEquals(tags(tree).filter((t) => t === PAGE_BREAK_TAG).length, 1, marker);
	}
});

Deno.test("pagebreak: the marker is configurable, and only the configured one fires", () => {
	const custom = [...pageBreakRules({ markers: "+++" }), ...defaultRules()];
	assertEquals(tags(parse("a\n\n+++\n\nb", custom)).includes(PAGE_BREAK_TAG), true);
	assertEquals(tags(parse("a\n\n\\pagebreak\n\nb", custom)).includes(PAGE_BREAK_TAG), false);
});

Deno.test("pagebreak: markers with different leading characters each get a rule", () => {
	const built = pageBreakRules({ markers: ["+++", "\\newpage"] });
	assertEquals(new Set(built.map((r) => r.trigger)), new Set(["+", "\\"]));
	const all = [...built, ...defaultRules()];
	assertEquals(tags(parse("a\n\n+++\n\nb", all)).includes(PAGE_BREAK_TAG), true);
	assertEquals(tags(parse("a\n\n\\newpage\n\nb", all)).includes(PAGE_BREAK_TAG), true);
});

Deno.test("pagebreak: a marker must be the whole line", () => {
	assertEquals(tags(parse("text \\pagebreak more", rules())).includes(PAGE_BREAK_TAG), false);
	assertEquals(tags(parse("\\pagebreaks", rules())).includes(PAGE_BREAK_TAG), false);
});

Deno.test("pagebreak: an empty marker list is rejected rather than matching nothing", () => {
	assertThrows(() => pageBreakRules({ markers: [] }));
});

/**
 * The bug this guards: the tag not being block-level leaves the lexer's
 * automatic `core:paragraph` wrapper in place, and every writer then emits the
 * break *inside* a paragraph - `<text:p><text:p/></text:p>` in odt, which is
 * invalid ODF and silently discarded by readers.
 */
Deno.test("pagebreak: the tag is registered block-level, so its paragraph wrapper collapses", () => {
	pageBreakRules();
	assertEquals(isBlockTag(PAGE_BREAK_TAG), true);
	const out = markdownWith("a\n\n\\pagebreak\n\nb", odtWriter(), rules());
	// Spelled out in full: the break paragraph must be a *sibling* of the
	// content paragraphs, not nested inside one.
	assertStringIncludes(
		out.parts["content.xml"],
		'<office:text><text:p text:style-name="Standard">a</text:p>' +
			'<text:p text:style-name="P1"/>' +
			'<text:p text:style-name="Standard">b</text:p></office:text>',
	);
});

// ---- html and markdown ----------------------------------------------------

Deno.test("pagebreak: renders to a CSS break and reads back", () => {
	const html = toHtml("a\n\n\\pagebreak\n\nb", rules());
	assertStringIncludes(html, 'class="pagebreak"');
	assertStringIncludes(html, "break-after:page");
	assertEquals(
		toMarkdown(fromHtml(html, { rules: rules() }), rules()).trim(),
		"a\n\n\\pagebreak\n\nb",
	);
});

Deno.test("pagebreak: `kind: column` changes the CSS and the emitted breaks", () => {
	const column = [...pageBreakRules({ kind: "column" }), ...defaultRules()];
	assertStringIncludes(toHtml("\\pagebreak", column), "break-after:column");
	assertStringIncludes(
		markdownWith("\\pagebreak", docxWriter(), column).parts["word/document.xml"],
		'<w:br w:type="column"/>',
	);
});

// ---- odt ------------------------------------------------------------------

/**
 * ODF has no page-break element: the break is `fo:break-before` on an automatic
 * paragraph style. Before paragraph styles were interned, `assemble` filtered
 * every non-character, non-list definition out of `<office:automatic-styles>`,
 * so the style name was minted, referenced by the body, and then dropped from
 * the file.
 */
Deno.test("odt: a page break is an automatic paragraph style, and it reaches the file", () => {
	const content = markdownWith("a\n\n\\pagebreak\n\nb", odtWriter(), rules()).parts["content.xml"];
	assertStringIncludes(content, '<style:style style:name="P1" style:family="paragraph"');
	assertStringIncludes(content, 'style:parent-style-name="Standard"');
	assertStringIncludes(content, '<style:paragraph-properties fo:break-before="page"/>');
	assertStringIncludes(content, '<text:p text:style-name="P1"/>');
});

Deno.test("odt: repeated breaks share one interned style", () => {
	const md = "a\n\n\\pagebreak\n\nb\n\n\\pagebreak\n\nc";
	const content = markdownWith(md, odtWriter(), rules()).parts["content.xml"];
	assertEquals(content.match(/style:family="paragraph"/g)?.length, 1);
	assertEquals(content.match(/<text:p text:style-name="P1"\/>/g)?.length, 2);
});

Deno.test("odt: a page break round-trips", () => {
	const parts = markdownWith("a\n\n\\pagebreak\n\nb", odtWriter(), rules()).parts;
	const back = xmlToMarkdown(
		parts["content.xml"],
		odtProfile({ styles: parts["styles.xml"], rules: pageBreakRules() }),
	);
	assertEquals(back.trim(), "a\n\n\\pagebreak\n\nb");
});

/**
 * LibreOffice does not write clawmark's empty-paragraph form: pressing
 * Ctrl+Enter puts `fo:break-before` on the paragraph that *follows* the break.
 * The reader has to accept both or every real-world odt loses its breaks.
 */
Deno.test("odt: a break carried by the following paragraph is read too", () => {
	const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">
	<office:automatic-styles>
		<style:style style:name="P1" style:family="paragraph" style:parent-style-name="Standard">
			<style:paragraph-properties fo:break-before="page"/>
		</style:style>
	</office:automatic-styles>
	<office:body><office:text>
		<text:p text:style-name="Standard">a</text:p>
		<text:p text:style-name="P1">b</text:p>
	</office:text></office:body>
</office:document-content>`;
	const back = xmlToMarkdown(content, odtProfile({ rules: pageBreakRules() }));
	assertEquals(back.trim(), "a\n\n\\pagebreak\n\nb");
});

// ---- docx -----------------------------------------------------------------

Deno.test("docx: a page break is a typed break run in its own paragraph", () => {
	const document = markdownWith("a\n\n\\pagebreak\n\nb", docxWriter(), rules())
		.parts["word/document.xml"];
	assertStringIncludes(document, '<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
});

Deno.test("docx: a page break round-trips", () => {
	const parts = markdownWith("a\n\n\\pagebreak\n\nb", docxWriter(), rules()).parts;
	const back = xmlToMarkdown(
		parts["word/document.xml"],
		docxProfile({ styles: parts["word/styles.xml"], rules: pageBreakRules() }),
	);
	assertEquals(back.trim(), "a\n\n\\pagebreak\n\nb");
});

/**
 * `<w:br>` with no type is a soft line break and must stay one - the typed
 * matcher has to be narrow enough not to swallow it.
 */
Deno.test("docx: an untyped `<w:br>` is still a line break", () => {
	const document = markdownWith("a\\\nb", docxWriter(), rules()).parts["word/document.xml"];
	assertStringIncludes(document, "<w:br/>");
	assertEquals(document.includes('w:type="page"'), false);
});
