import { assertEquals, assertStringIncludes } from "@std/assert";
import { markdownWith } from "../mod.ts";
import { parseXml } from "../xml/mod.ts";
import { odtWriter } from "./odt/mod.ts";
import { docxWriter } from "./docx/mod.ts";
import { resolvePage } from "./page.ts";

Deno.test("resolvePage: named sizes, landscape, margins, font", () => {
	const warnings: string[] = [];
	const page = resolvePage({
		size: "a4",
		orientation: "landscape",
		margins: { top: "1in", left: "2.54cm" },
		font: { family: "Garamond", size: "11pt" },
	}, (m) => warnings.push(m));
	assertEquals(page.size, { width: 841.89, height: 595.28, landscape: true });
	assertEquals(Math.round(page.margins!.left!), 72);
	assertEquals(page.margins!.top, 72);
	assertEquals(page.font, { family: "Garamond", size: 11 });
	assertEquals(warnings, []);

	resolvePage({ margins: "lots" }, (m) => warnings.push(m));
	assertEquals(warnings.length, 1);
});

Deno.test("docx write: page setup lands in sectPr and docDefaults", () => {
	const { parts, warnings } = markdownWith(
		"Hello",
		docxWriter({
			page: {
				size: "letter",
				margins: "1in",
				font: { family: "Times New Roman", size: "12pt" },
			},
		}),
	);
	assertEquals(warnings, []);
	const doc = parts["word/document.xml"];
	assertStringIncludes(doc, '<w:pgSz w:w="12240" w:h="15840"/>');
	assertStringIncludes(doc, 'w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"');
	const styles = parts["word/styles.xml"];
	assertStringIncludes(styles, '<w:rFonts w:ascii="Times New Roman"');
	assertStringIncludes(styles, '<w:sz w:val="24"/>');
	assertEquals(styles.indexOf("w:docDefaults") < styles.indexOf("<w:style "), true);
	parseXml(doc);
	parseXml(styles);
});

Deno.test("docx write: no page option leaves an empty sectPr", () => {
	const { parts } = markdownWith("Hello", docxWriter());
	assertStringIncludes(parts["word/document.xml"], "<w:sectPr/>");
	assertEquals(parts["word/styles.xml"].includes("docDefaults"), false);
});

Deno.test("odt write: page setup lands in a page layout on the Standard master", () => {
	const { parts } = markdownWith(
		"Hello",
		odtWriter({
			page: {
				size: "a5",
				orientation: "landscape",
				margins: "2cm",
				font: { family: "Liberation Serif" },
			},
		}),
	);
	const styles = parts["styles.xml"];
	parseXml(styles);
	assertStringIncludes(styles, 'fo:page-width="595.28pt" fo:page-height="419.53pt"');
	assertStringIncludes(styles, 'style:print-orientation="landscape"');
	assertStringIncludes(styles, 'fo:margin-top="56.69pt"');
	assertStringIncludes(
		styles,
		'<style:master-page style:name="Standard" style:page-layout-name="clawmark_page"/>',
	);
	assertStringIncludes(styles, `fo:font-family="'Liberation Serif'"`);
});
