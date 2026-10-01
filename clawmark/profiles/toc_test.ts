import { assertEquals, assertStringIncludes } from "@std/assert";
import { markdownWith, parse, toHtml, toMarkdown } from "../mod.ts";
import { defaultRules } from "../rules/mod.ts";
import { tocRule } from "../rules/extra/mod.ts";
import { parseXml } from "../xml/mod.ts";
import { docxWriter } from "./docx/mod.ts";
import { odtWriter } from "./odt/mod.ts";
import { htmlWriter } from "./html/mod.ts";
import { textWriter } from "./text/mod.ts";

const SOURCE = "[TOC]\n\n# One\n\nText\n\n## One A\n\n#### Too deep\n\n# Two";
const rules = () => [tocRule({ title: "Contents" }), ...defaultRules()];

Deno.test("toc: [TOC] parses to md:toc ahead of the link rule, and round-trips", () => {
	const tree = parse(SOURCE, rules());
	const first = tree.children[0];
	const toc = first.tag === "core:paragraph" ? first.children[0] : first;
	assertEquals(toc.tag, "md:toc");
	assertEquals(toMarkdown(tree, rules()).startsWith("[TOC]"), true);
	assertEquals(toHtml("[TOC]", rules()), '<nav class="toc"></nav>');
});

Deno.test("toc: docx gets a dirty TOC field with cached entries, and updateFields", () => {
	const { parts } = markdownWith(SOURCE, docxWriter(), rules());
	const doc = parts["word/document.xml"];
	parseXml(doc);
	assertStringIncludes(doc, '<w:fldChar w:fldCharType="begin" w:dirty="true"/>');
	assertStringIncludes(doc, 'TOC \\o "1-3" \\h \\z \\u');
	assertStringIncludes(doc, '<w:pStyle w:val="TOCHeading"/>');
	assertStringIncludes(doc, '<w:pStyle w:val="TOC2"/>');
	assertEquals(doc.includes('Too deep</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="TOC'), false);
	assertEquals(
		(doc.match(/w:fldCharType="end"/g) ?? []).length,
		1,
		"one field spanning every entry",
	);
	assertStringIncludes(parts["word/settings.xml"], '<w:updateFields w:val="true"/>');
	assertStringIncludes(parts["[Content_Types].xml"], "/word/settings.xml");
	assertStringIncludes(parts["word/_rels/document.xml.rels"], 'Target="settings.xml"');
	assertStringIncludes(parts["word/styles.xml"], 'w:styleId="TOC1"');
});

Deno.test("toc: odt gets a text:table-of-content with the entries in its body", () => {
	const { parts } = markdownWith(SOURCE, odtWriter(), rules());
	const content = parts["content.xml"];
	parseXml(content);
	assertStringIncludes(content, '<text:table-of-content-source text:outline-level="3">');
	assertStringIncludes(content, '<text:p text:style-name="Contents_20_1">One</text:p>');
	assertStringIncludes(content, '<text:p text:style-name="Contents_20_2">One A</text:p>');
	assertEquals(content.includes(">Too deep</text:p></text:index-body>"), false);
	assertStringIncludes(parts["styles.xml"], 'style:name="Contents_20_1"');
});

Deno.test("toc: html and text list the headings", () => {
	const html = markdownWith(SOURCE, htmlWriter(), rules()).parts;
	const page = Object.values(html).join("");
	assertStringIncludes(page, '<nav class="toc"><h2>Contents</h2><ol><li class="toc-1">One</li>');
	const text = Object.values(markdownWith(SOURCE, textWriter(), rules()).parts).join("");
	assertStringIncludes(text, "Contents\nOne\n  One A\nTwo");
});

Deno.test("page numbers: docx footer part, referenced first in sectPr", () => {
	const { parts } = markdownWith(
		"Hello",
		docxWriter({ page: { pageNumbers: "right", margins: "1in" } }),
	);
	const doc = parts["word/document.xml"];
	assertStringIncludes(
		doc,
		'<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter1"/><w:pgMar',
	);
	assertStringIncludes(
		parts["word/footer1.xml"],
		'<w:instrText xml:space="preserve"> PAGE </w:instrText>',
	);
	assertStringIncludes(parts["word/footer1.xml"], '<w:jc w:val="right"/>');
	assertStringIncludes(parts["[Content_Types].xml"], "/word/footer1.xml");
	assertStringIncludes(parts["word/_rels/document.xml.rels"], 'Id="rIdFooter1"');
	parseXml(parts["word/footer1.xml"]);
});

Deno.test("page numbers: odt footer on the Standard master page", () => {
	const { parts } = markdownWith("Hello", odtWriter({ page: { pageNumbers: true } }));
	const styles = parts["styles.xml"];
	parseXml(styles);
	assertStringIncludes(styles, '<text:page-number text:select-page="current">');
	assertStringIncludes(styles, "<style:footer-style>");
	assertStringIncludes(styles, 'fo:text-align="center"');
});
