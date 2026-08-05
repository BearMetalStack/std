import { assertEquals, assertStringIncludes } from "@std/assert";
import { convert, markdownWith, parse, toMarkdown, xmlToMarkdown } from "../../mod.ts";
import { parseXml } from "../../xml/mod.ts";
import type { XmlElement } from "../../xml/types.ts";
import { odtProfile, odtWriter } from "./mod.ts";
import { docxProfile, docxWriter } from "../docx/mod.ts";

function write(md: string): Record<string, string> {
	return markdownWith(md, odtWriter()).parts;
}

function read(parts: Record<string, string>): string {
	return xmlToMarkdown(parts["content.xml"], odtProfile({ styles: parts["styles.xml"] })).trim();
}

function round(md: string): string {
	return read(write(md));
}

/** See docx_write_test.ts for why the target is the engine's own fixed point. */
function assertStable(md: string) {
	assertEquals(round(md), toMarkdown(parse(md)).trim());
}

// ---- construct inventory --------------------------------------------------

Deno.test("odt write: paragraphs", () => {
	assertStable("Hello world");
	assertStable("First\n\nSecond");
});

Deno.test("odt write: headings", () => {
	assertStable("# One");
	assertStable("#### Four");
	assertStable("###### Six");
	assertStable("# Title\n\nBody text");
});

Deno.test("odt write: inline emphasis", () => {
	assertStable("plain **bold** text");
	assertStable("*italic* and **bold** and ***both***");
	assertStable("~~strike~~ and ++under++ and ==mark==");
});

Deno.test("odt write: a `<text:span>` nests, so emphasis inside emphasis survives", () => {
	assertStable("a **b *c* d** e");
});

Deno.test("odt write: code", () => {
	assertStable("use `code` inline");
	assertStable("```\nlet x = 1;\nlet y = 2;\n```");
});

Deno.test("odt write: blockquote", () => {
	assertStable("> quoted line");
	assertStable("> quoted line\n> second line");
});

Deno.test("odt write: lists", () => {
	assertStable("- a\n- b");
	assertStable("- a\n- b\n  - nested");
	assertStable("1. one\n2. two");
});

Deno.test("odt write: table", () => {
	assertStable("| a | b |\n| --- | --- |\n| 1 | 2 |");
});

Deno.test("odt write: links, images, breaks, rules", () => {
	assertStable("[text](http://x.com)");
	assertStable("![alt](img.png)");
	assertStable("a\\\nb");
	assertStable("a\n\n---\n\nb");
});

Deno.test("odt write: footnotes", () => {
	assertStable("ref[^1]\n\n[^1]: the note");
	assertStable("one[^1] and two[^2]\n\n[^1]: first\n\n[^2]: second");
});

// ---- the shape of what is produced ----------------------------------------

Deno.test("odt write: emits the parts a package needs", () => {
	const result = markdownWith("# Hello", odtWriter());
	assertEquals(
		Object.keys(result.parts).sort(),
		["META-INF/manifest.xml", "content.xml", "meta.xml", "mimetype", "styles.xml"],
	);
	assertEquals(result.primary, "content.xml");
	assertEquals(result.extension, "odt");
	// Byte-exact, with no trailing newline: some readers compare the entry
	// against the media type directly.
	assertEquals(result.parts["mimetype"], "application/vnd.oasis.opendocument.text");
});

Deno.test("odt write: a heading is a real `<text:h>` with an outline level", () => {
	assertStringIncludes(
		write("#### Four")["content.xml"],
		'<text:h text:style-name="Heading_20_4" text:outline-level="4">',
	);
});

Deno.test("odt write: identical formatting shares one automatic style", () => {
	const content = write("**one** and **two**")["content.xml"];
	// Two bold spans, one definition.
	assertEquals(content.split('text:style-name="T1"').length - 1, 2);
	assertEquals(content.split("<style:style").length - 1, 1);
});

Deno.test("odt write: nested lists of different kinds get their own list style", () => {
	const content = write("- a\n\n1. one")["content.xml"];
	assertStringIncludes(content, '<text:list-style style:name="L1">');
	assertStringIncludes(content, '<text:list-style style:name="L2">');
	assertStringIncludes(content, "<text:list-level-style-bullet");
	assertStringIncludes(content, "<text:list-level-style-number");
});

/**
 * Every automatic style the body names must be defined, or a reader falls back
 * to defaults and the formatting silently disappears. This is the invariant the
 * `StyleSink` exists to guarantee, so it is worth asserting directly rather
 * than only through the round trip.
 */
Deno.test("odt write: every style the body references is defined", () => {
	const parts = write(
		"# H\n\n**bold** and *italic* and `code`\n\n- a\n  - b\n\n> q\n\n```\ncode\n```\n\n---\n\n| a | b |\n| --- | --- |\n| 1 | 2 |",
	);
	const content = parseXml(parts["content.xml"]);
	const styles = parseXml(parts["styles.xml"]);

	const defined = new Set<string>();
	const collectDefs = (root: XmlElement) => {
		const walk = (el: XmlElement) => {
			for (const child of el.children) {
				if (child.kind !== "element") continue;
				if (child.name === "style" || child.name === "list-style") {
					const name = child.attrs.get("style:name");
					if (name) defined.add(name);
				}
				walk(child);
			}
		};
		walk(root);
	};
	collectDefs(content);
	collectDefs(styles);

	const referenced = new Set<string>();
	const collectRefs = (el: XmlElement) => {
		for (const child of el.children) {
			if (child.kind !== "element") continue;
			for (const key of ["text:style-name", "table:style-name"]) {
				const name = child.attrs.get(key);
				if (name) referenced.add(name);
			}
			collectRefs(child);
		}
	};
	collectRefs(content);

	const dangling = [...referenced].filter((name) => !defined.has(name)).sort();
	assertEquals(dangling, []);
});

// ---- cross-format ---------------------------------------------------------

/**
 * The tree is the pivot, not a docx-shaped or odt-shaped intermediate. Going
 * out through one format and back in through the other has to land in the same
 * place as going nowhere at all.
 */
Deno.test("cross-format: md -> docx -> md -> odt -> md", () => {
	const source = "# Title\n\nSome **bold** text\n\n- a\n- b\n\n> quoted\n\n[link](http://x.com)";
	const expected = toMarkdown(parse(source)).trim();

	const docx = markdownWith(source, docxWriter()).parts;
	const viaDocx = xmlToMarkdown(
		docx["word/document.xml"],
		docxProfile({
			styles: docx["word/styles.xml"],
			numbering: docx["word/numbering.xml"],
			rels: docx["word/_rels/document.xml.rels"],
		}),
	).trim();
	assertEquals(viaDocx, expected);

	const odt = markdownWith(viaDocx, odtWriter()).parts;
	assertEquals(read(odt), expected);
});

Deno.test("cross-format: convert() reads one format and writes another", () => {
	const docx = markdownWith("# Title\n\n**bold**", docxWriter()).parts;
	const result = convert(
		docx["word/document.xml"],
		docxProfile({ styles: docx["word/styles.xml"] }),
		odtWriter(),
	);
	assertStringIncludes(result.parts["content.xml"], "<text:h ");
	assertEquals(read(result.parts), "# Title\n\n**bold**");
});

// ---- normalization --------------------------------------------------------

/**
 * The point of routing a document through the tree: a non-conformant odt comes
 * back out built to spec, not reproduced.
 *
 * This fixture collects what real exporters actually do wrong - all of it
 * behavior `odtProfile` already documents having to tolerate. Google Docs
 * writes headings as `<text:p>` carrying a heading *style* with an **empty**
 * `style:default-outline-level`, never as `<text:h>`; style names arrive
 * `_20_`-escaped; and a body routinely references automatic styles that were
 * never defined.
 */
const MALFORMED_ODT = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
	xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
	xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
	xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
	xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">
	<office:automatic-styles>
		<style:style style:name="Heading_20_1" style:display-name="Heading 1"
			style:family="paragraph" style:default-outline-level=""/>
		<style:style style:name="T7" style:family="text">
			<style:text-properties fo:font-weight="bold"/>
		</style:style>
	</office:automatic-styles>
	<office:body><office:text>
		<text:p text:style-name="Heading_20_1">The Title</text:p>
		<text:p text:style-name="P99">Body with <text:span text:style-name="T7">bold</text:span> and <text:span text:style-name="T404">undefined-style</text:span> text.</text:p>
	</office:text></office:body>
</office:document-content>`;

Deno.test("normalization: a malformed odt comes back out conformant", () => {
	const result = convert(MALFORMED_ODT, odtProfile(), odtWriter());
	const content = result.parts["content.xml"];

	// The heading-styled paragraph becomes a real heading element.
	assertStringIncludes(content, '<text:h text:style-name="Heading_20_1" text:outline-level="1">');
	assertEquals(content.includes('<text:p text:style-name="Heading_20_1"'), false);

	// The undefined style references are gone; what is left is defined.
	assertEquals(content.includes("T404"), false);
	assertEquals(content.includes("P99"), false);
	assertStringIncludes(content, '<style:style style:name="T1" style:family="text">');

	// And the package is complete, where the input was a bare content.xml.
	assertEquals(
		Object.keys(result.parts).sort(),
		["META-INF/manifest.xml", "content.xml", "meta.xml", "mimetype", "styles.xml"],
	);
});

Deno.test("normalization: content survives the trip unchanged", () => {
	const before = xmlToMarkdown(MALFORMED_ODT, odtProfile()).trim();
	const after = read(convert(MALFORMED_ODT, odtProfile(), odtWriter()).parts);
	assertEquals(before, "# The Title\n\nBody with **bold** and undefined-style text.");
	assertEquals(after, before);
});
