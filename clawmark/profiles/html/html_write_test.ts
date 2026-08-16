import { assertEquals, assertStringIncludes } from "@std/assert";
import {
	createDocumentStyles,
	defaultRules,
	fromHtml,
	markdownWith,
	parse,
	toHtml,
	toMarkdown,
} from "../../mod.ts";
import { pageBreakRules } from "../../rules/extra/mod.ts";
import { addBlockTags } from "../../rules/paragraph.ts";
import type { AnyRule, Node, WriteProfile } from "../../types.ts";
import { htmlWriter } from "./mod.ts";
import { renderWith } from "../../write.ts";

function write(md: string, profile: WriteProfile = htmlWriter()): Record<string, string> {
	return markdownWith(md, profile, defaultRules()).parts;
}

function html(md: string, profile?: WriteProfile): string {
	return write(md, profile)["index.html"];
}

/**
 * Every construct the default rule set can produce.
 *
 * This is the corpus the drift guard runs over, so anything added to
 * `defaultRules()` belongs here too - an unlisted construct is an untested one.
 */
const CORPUS: [string, string][] = [
	["heading", "# Title\n"],
	["paragraph", "Just a plain paragraph.\n"],
	["emphasis", "a **bold** *italic* ***both*** ~~gone~~ ++under++ ==mark==\n"],
	["code span", "use `foo()` here\n"],
	["code block", "```ts\nconst x = 1;\n```\n"],
	["code block, no language", "```\nplain\n```\n"],
	["hr", "---\n"],
	["link", 'see [text](http://example.com/ "T")\n'],
	["image", "![alt](img.png)\n"],
	["line break", "one\\\ntwo\n"],
	["blockquote", "> quoted line\n> second\n"],
	["ordered list", "1. one\n2. two\n"],
	["unordered list", "- one\n- two\n"],
	["nested list", "- one\n  - deep\n"],
	["checklist", "- [x] done\n- [ ] todo\n"],
	["table", "| a | b |\n| :- | -: |\n| 1 | 2 |\n"],
	["footnote", "text[^1]\n\n[^1]: the note\n"],
	["multiple blocks", "# T\n\nBody text.\n\n- a\n- b\n"],
];

// ---- the drift guard ------------------------------------------------------

Deno.test("html write: matches toHtml for every construct", () => {
	// `toHtml` and this profile are two implementations of one format. Each rule
	// reads its own markup back in `match()`, so a change to one that misses the
	// other silently breaks `fromHtml`. This is the test that catches it.
	for (const [name, source] of CORPUS) {
		assertEquals(html(source), toHtml(source, defaultRules()), name);
	}
});

Deno.test("html write: matches toHtml for opt-in page breaks", () => {
	const rules = () => [...pageBreakRules(), ...defaultRules()] as AnyRule[];
	const source = "before\n\n\\pagebreak\n\nafter\n";
	assertEquals(
		markdownWith(source, htmlWriter(), rules()).parts["index.html"],
		toHtml(source, rules()),
	);
});

Deno.test("html write: text escaping differs from toHtml, equivalently", () => {
	// The one place the two paths are not byte-identical. `escapeHtml` escapes
	// quotes in text content; the XML serializer does not, because text content
	// is the one place they need no escaping. Both parse to the same characters,
	// which is the property that actually matters.
	const source = `he said "hi" & 'bye' <x>\n`;
	const viaRender = toHtml(source, defaultRules());
	const viaWriter = html(source);

	assertStringIncludes(viaRender, "&quot;hi&quot;");
	assertStringIncludes(viaWriter, '"hi"');
	assertEquals(toMarkdown(fromHtml(viaWriter)), toMarkdown(fromHtml(viaRender)));
});

// ---- round trip -----------------------------------------------------------

Deno.test("html write: output reads back to the same markdown", () => {
	for (const [name, source] of CORPUS) {
		assertEquals(
			toMarkdown(fromHtml(html(source))).trim(),
			toMarkdown(parse(source)).trim(),
			name,
		);
	}
});

// ---- styling --------------------------------------------------------------

const NOVEL = createDocumentStyles()
	.define("SceneBreak", { align: "c", spaceBefore: "1.5em", fontStyle: "italic" })
	.define("Thought", { family: "text", fontStyle: "italic" })
	.bind("graver:scenebreak", "SceneBreak")
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

Deno.test("html write: a bound custom tag becomes a classed element", () => {
	const result = renderWith(
		tree(node("graver:scenebreak", [text("* * *")])),
		htmlWriter({ styles: NOVEL }),
	);

	assertEquals(result.parts["index.html"], '<p class="scene-break">* * *</p>');
	assertStringIncludes(result.parts["styles.css"], ".scene-break {");
	assertStringIncludes(result.parts["styles.css"], "text-align: center;");
});

Deno.test("html write: a text-family style becomes a span", () => {
	const result = renderWith(
		tree(node("core:paragraph", [text("she thought "), node("graver:thought", [text("no")])])),
		htmlWriter({ styles: NOVEL }),
	);
	assertEquals(
		result.parts["index.html"],
		'<p>she thought <span class="thought">no</span></p>',
	);
});

Deno.test("html write: binding a known tag decorates its element, not replaces it", () => {
	// The html writer differs from the office ones here on purpose: CSS
	// decorates elements, so a styled blockquote stays a blockquote.
	const styles = createDocumentStyles()
		.define("Verse", { fontStyle: "italic", indentLeft: "2em" })
		.bind("md:blockquote", "Verse");

	assertStringIncludes(html("> a line\n", htmlWriter({ styles })), '<blockquote class="verse">');
});

Deno.test("html write: a style's role picks the element for a custom tag", () => {
	const styles = createDocumentStyles()
		.define("ChapterTitle", { role: "heading", headingLevel: 2, align: "c" })
		.define("Aside", { element: "aside" })
		.bind("graver:chapter", "ChapterTitle")
		.bind("graver:aside", "Aside");

	const result = renderWith(
		tree(
			node("graver:chapter", [text("One")]),
			node("graver:aside", [text("note")]),
		),
		htmlWriter({ styles }),
	);
	assertStringIncludes(result.parts["index.html"], '<h2 class="chapter-title">One</h2>');
	assertStringIncludes(result.parts["index.html"], '<aside class="aside">note</aside>');
});

Deno.test("html write: a wrapper around blocks is a div, never a p", () => {
	// `<p>` cannot contain block content - the parser closes it at the first
	// block start tag, and the children would escape the wrapper entirely.
	addBlockTags("graver:section");
	const styles = createDocumentStyles()
		.define("Section", { spaceBefore: "2em" })
		.bind("graver:section", "Section");

	const result = renderWith(
		tree(node("graver:section", [node("core:paragraph", [text("inside")])])),
		htmlWriter({ styles }),
	);
	assertEquals(result.parts["index.html"], '<div class="section"><p>inside</p></div>');
});

Deno.test("html write: a node's own style overrides its tag binding", () => {
	const styles = createDocumentStyles()
		.define("SceneBreak", { align: "c" })
		.define("Emphatic", { align: "r" })
		.bind("graver:scenebreak", "SceneBreak");

	const result = renderWith(
		tree(node("graver:scenebreak", [text("x")], { style: "Emphatic" })),
		htmlWriter({ styles }),
	);
	assertStringIncludes(result.parts["index.html"], 'class="emphatic"');
});

// ---- stylesheet placement -------------------------------------------------

Deno.test("html write: stylesheet placement", () => {
	const part = write("hi\n", htmlWriter({ styles: NOVEL }));
	assertEquals("styles.css" in part, true);
	assertEquals(part["index.html"].includes("<style>"), false);

	const inline = write("hi\n", htmlWriter({ styles: NOVEL, stylesheet: "inline" }));
	assertEquals("styles.css" in inline, false);
	assertStringIncludes(inline["index.html"], "<style>");
	// A `<style>` element's content is raw text - escaping it would break it.
	assertStringIncludes(inline["index.html"], ".scene-break {");

	const none = write("hi\n", htmlWriter({ styles: NOVEL, stylesheet: "none" }));
	assertEquals("styles.css" in none, false);
	assertEquals(none["index.html"].includes("<style>"), false);

	// No registry means no stylesheet at all, not an empty one.
	assertEquals("styles.css" in write("hi\n"), false);
});

Deno.test("html write: a full document links its stylesheet", () => {
	const parts = write(
		"hi\n",
		htmlWriter({ styles: NOVEL, document: "full", title: "My <Novel>", lang: "fr" }),
	);
	const doc = parts["index.html"];

	assertStringIncludes(doc, "<!doctype html>");
	assertStringIncludes(doc, '<html lang="fr">');
	assertStringIncludes(doc, '<link rel="stylesheet" href="styles.css">');
	// The title is escaped, since it is caller-supplied.
	assertStringIncludes(doc, "<title>My &lt;Novel&gt;</title>");
	assertStringIncludes(doc, "<p>hi</p>");
});

Deno.test("html write: classPrefix reaches both the markup and the sheet", () => {
	const parts = renderWith(
		tree(node("graver:scenebreak", [text("x")])),
		htmlWriter({ styles: NOVEL, classPrefix: "gv-" }),
	).parts;

	assertStringIncludes(parts["index.html"], 'class="gv-scene-break"');
	assertStringIncludes(parts["styles.css"], ".gv-scene-break {");
});

Deno.test("html write: result metadata", () => {
	const result = markdownWith("hi\n", htmlWriter(), defaultRules());
	assertEquals(result.primary, "index.html");
	assertEquals(result.extension, "html");
	assertEquals(result.mediaType, "text/html");
});

// ---- raw ------------------------------------------------------------------

Deno.test("html write: raw markup passes through as markup", () => {
	// Nothing in markdown syntax produces an `md:raw`; the crawler's `raw`
	// unmatched policy does, so the node is built directly here.
	const result = renderWith(
		tree(node("md:raw", [], { value: "<figure><b>x</b></figure>" })),
		htmlWriter(),
	);
	// Verbatim markup, not escaped text - escaping it would defeat the rule.
	assertEquals(result.parts["index.html"], "<figure><b>x</b></figure>");
	assertEquals(
		renderWith(tree(node("md:raw", [], { value: "" })), htmlWriter()).parts[
			"index.html"
		],
		"",
	);
});

Deno.test("html write: markdown that looks like markup is still escaped", () => {
	// The lexer never makes an `md:raw` out of angle brackets in prose, and this
	// profile must not either - agreeing with `toHtml` is the whole point.
	assertEquals(html("<div><b>x</b></div>\n"), toHtml("<div><b>x</b></div>\n", defaultRules()));
	assertStringIncludes(html("<div><b>x</b></div>\n"), "&lt;div&gt;");
});

// ---- xhtml ------------------------------------------------------------------

Deno.test("html write: default output is unchanged (regression)", () => {
	// Void elements stay bare and boolean attributes stay in HTML's short form
	// when `output` is not passed - the whole point is that xhtml is opt-in.
	assertStringIncludes(html("one\\\ntwo\n"), "<br>");
	assertStringIncludes(html("---\n"), "<hr>");
	const checklist = html("- [x] done\n- [ ] todo\n");
	assertStringIncludes(checklist, '<input type="checkbox" disabled checked>');
	assertStringIncludes(checklist, '<input type="checkbox" disabled>');
});

Deno.test("html write: xhtml self-closes void elements", () => {
	const xhtml = (md: string) => html(md, htmlWriter({ output: "xhtml" }));
	assertStringIncludes(xhtml("one\\\ntwo\n"), "<br/>");
	assertStringIncludes(xhtml("---\n"), "<hr/>");
	assertStringIncludes(xhtml("![alt](img.png)\n"), '<img src="img.png" alt="alt"/>');
});

Deno.test("html write: xhtml canonicalizes boolean attributes", () => {
	const checklist = html("- [x] done\n- [ ] todo\n", htmlWriter({ output: "xhtml" }));
	assertStringIncludes(checklist, 'disabled="disabled" checked="checked"');
	assertStringIncludes(checklist, 'type="checkbox" disabled="disabled"/>');
});

Deno.test("html write: xhtml raw markup normalizes loosely-written void tags", () => {
	// `md:raw` still parses in tolerant html mode - the loose `<br>` is only
	// self-closed because *serializing* happens in xhtml mode, independent of
	// how the fragment was parsed.
	const result = renderWith(
		tree(node("md:raw", [], { value: "<p>a<br>b</p>" })),
		htmlWriter({ output: "xhtml" }),
	);
	assertEquals(result.parts["index.html"], "<p>a<br/>b</p>");
});

Deno.test("html write: xhtml full document gets xmlns and an xml declaration", () => {
	const doc = write("hi\n", htmlWriter({ output: "xhtml", document: "full", lang: "fr" }))[
		"index.html"
	];
	assertStringIncludes(doc, '<?xml version="1.0" encoding="UTF-8"?>\n<!doctype html>');
	assertStringIncludes(
		doc,
		'<html lang="fr" xml:lang="fr" xmlns="http://www.w3.org/1999/xhtml">',
	);
});

Deno.test("html write: xhtml fragments never get an xml declaration", () => {
	// A declaration is only legal as the very first thing in a document - a
	// fragment meant for embedding elsewhere must never carry one.
	const fragment = html("hi\n", htmlWriter({ output: "xhtml" }));
	assertEquals(fragment.startsWith("<?xml"), false);
});
