import { assertEquals, assertStringIncludes } from "@std/assert";
import type { AnyEmitter, Node, WriteProfile } from "./types.ts";
import { markdownWith, renderWith } from "./mod.ts";
import { createResourceSink, singlePart } from "./write.ts";
import { createStyleSink } from "./style.ts";
import { out, outAny } from "./dsl.ts";
import { XML_DECL } from "./xml/build.ts";

function profile(emitters: AnyEmitter[], overrides: Partial<WriteProfile> = {}): WriteProfile {
	return {
		name: "test",
		emitters,
		assemble: singlePart("out.xml"),
		...overrides,
	};
}

function render(md: string, emitters: AnyEmitter[], overrides?: Partial<WriteProfile>): string {
	const result = markdownWith(md, profile(emitters, overrides));
	return result.parts["out.xml"].slice(XML_DECL.length);
}

// ---- dispatch -------------------------------------------------------------

Deno.test("precedence is position in the emitters array", () => {
	const first = out("core:text").leaf("first");
	const second = out("core:text").leaf("second");
	assertEquals(render("a", [first, second]), "<first/>");
	assertEquals(render("a", [second, first]), "<second/>");
});

Deno.test("an emitter that declines falls through to the next", () => {
	const declines = out("core:text").where(() => false).leaf("no");
	const claims = out("core:text").leaf("yes");
	assertEquals(render("a", [declines, claims]), "<yes/>");
});

Deno.test("the wildcard bucket is consulted for every tag, in array order", () => {
	const wildcard = outAny().wrap("any");
	const specific = out("core:text").leaf("text");
	// Specific first: it wins for core:text, the wildcard covers the paragraph.
	assertEquals(render("a", [specific, wildcard]), "<any><text/></any>");
	// Wildcard first: it wins for everything, including the text.
	assertEquals(render("a", [wildcard, specific]), "<any><any/></any>");
});

// ---- result kinds ---------------------------------------------------------

Deno.test("wrap emits an element around the node's children", () => {
	assertEquals(
		render("a", [out("core:paragraph").wrap("p"), out("core:text").leaf("t")]),
		"<p><t/></p>",
	);
});

Deno.test("chain nests elements and puts children in the innermost", () => {
	assertEquals(
		render("a", [out("core:paragraph").chain(["a", "b", "c"]), out("core:text").leaf("t")]),
		"<a><b><c><t/></c></b></a>",
	);
});

Deno.test("`into` places children after content the emitter already added", () => {
	const paragraph: AnyEmitter = {
		tag: "core:paragraph",
		emit: (_node, ctx) => {
			const el = ctx.el("p", {}, [ctx.el("props")]);
			return { kind: "element", el, into: el };
		},
	};
	assertEquals(
		render("a", [paragraph, out("core:text").leaf("t")]),
		"<p><props/><t/></p>",
	);
});

Deno.test("unwrap keeps children, drop discards the subtree", () => {
	assertEquals(render("a", [out("core:paragraph").unwrap(), out("core:text").leaf("t")]), "<t/>");
	assertEquals(render("a", [out("core:paragraph").drop(), out("core:text").leaf("t")]), "");
});

Deno.test("attrs may be a function of the node, and undefined values are omitted", () => {
	const emitter = out("md:heading").leaf("h", (node) => ({
		level: Number(node.data.level),
		missing: undefined,
	}));
	// Built by hand rather than parsed: `## x` is mis-lexed by the forward
	// lexer (levels 2 and 3 come out as 1), and this test is about attrs.
	const tree: Node = {
		tag: "core:root",
		data: {},
		children: [{ tag: "md:heading", data: { level: 2 }, children: [] }],
	};
	const result = renderWith(tree, profile([emitter]));
	assertEquals(result.parts["out.xml"].slice(XML_DECL.length), '<h level="2"/>');
});

// ---- style frames ---------------------------------------------------------

Deno.test("style frames accumulate down the tree and pop on the way out", () => {
	const emitters = [
		out("core:paragraph").unwrap(),
		out("md:bold").style({ bold: true }),
		out("md:italic").style({ italic: true }),
		out("core:text").to((node, ctx) => ({
			kind: "nodes",
			nodes: [ctx.el("t", {
				v: String((node.data as { value: string }).value),
				b: ctx.style.bold === true,
				i: ctx.style.italic === true,
			})],
		})),
	];
	assertEquals(
		render("**a *b* c**", emitters),
		'<t v="a " b=""/><t v="b" b="" i=""/><t v=" c" b=""/>',
	);
});

Deno.test("an inner frame's explicit false overrides an outer true", () => {
	const emitters = [
		out("core:paragraph").unwrap(),
		out("md:bold").style({ bold: true }),
		out("md:italic").style({ bold: false }),
		out("core:text").to((_node, ctx) => ({
			kind: "nodes",
			nodes: [ctx.el("t", { b: ctx.style.bold === true })],
		})),
	];
	assertEquals(render("**a *b***", emitters), '<t b=""/><t/>');
});

Deno.test("whereStyle matches on the accumulated frame", () => {
	const emitters = [
		out("core:paragraph").unwrap(),
		out("md:bold").style({ bold: true }),
		out("core:text").whereStyle((s) => s.bold === true).leaf("strong"),
		out("core:text").leaf("plain"),
	];
	assertEquals(render("a **b**", emitters), "<plain/><strong/>");
});

// ---- unclaimed policies ---------------------------------------------------

Deno.test("core:text falls back to a text node so nothing vanishes silently", () => {
	assertEquals(render("hello", [out("core:paragraph").wrap("p")]), "<p>hello</p>");
});

Deno.test("unclaimed policies: unwrap (default), drop, text", () => {
	const claimText = out("core:text").leaf("t");
	assertEquals(render("a", [claimText]), "<t/>");
	assertEquals(render("a", [claimText], { unclaimed: "drop" }), "");
	assertEquals(render("a", [], { unclaimed: "text" }), "a");
});

Deno.test("an unclaimed handler may return a result, and null falls back to unwrap", () => {
	const seen: string[] = [];
	const html = render("a", [out("core:text").leaf("t")], {
		unclaimed: (node) => {
			seen.push(node.tag);
			return node.tag === "core:paragraph" ? { kind: "drop" } : null;
		},
	});
	assertEquals(html, "");
	assertEquals(seen, ["core:paragraph"]);
});

// ---- warnings and assemble ------------------------------------------------

Deno.test("warnings reach both onWarn and the result", () => {
	const collected: string[] = [];
	const result = markdownWith(
		"a",
		profile([
			out("core:text").to((_node, ctx) => {
				ctx.warn("something");
				return { kind: "drop" };
			}),
		], { onWarn: (message) => collected.push(message) }),
	);
	assertEquals(collected, ["something"]);
	assertEquals(result.warnings, ["something"]);
});

Deno.test("assemble sees the interned sinks and names the primary part", () => {
	const result = renderWith({ tag: "core:root", data: {}, children: [] } as Node, {
		name: "t",
		emitters: [],
		assemble: (_body, ctx) => ({
			parts: { "a.xml": ctx.serialize(ctx.el("empty")) },
			primary: "a.xml",
			warnings: [...ctx.warnings],
		}),
	});
	assertEquals(result.primary, "a.xml");
	assertStringIncludes(result.parts["a.xml"], "<empty/>");
	assertStringIncludes(result.parts["a.xml"], "<?xml version=");
});

// ---- sinks ----------------------------------------------------------------

Deno.test("createStyleSink dedups identical styles and ignores property order", () => {
	const sink = createStyleSink();
	const first = sink.ensure({ bold: true, italic: true });
	const second = sink.ensure({ italic: true, bold: true });
	assertEquals(first, second);
	assertEquals(sink.defs.length, 1);
	assertEquals(sink.ensure({ bold: true }) === first, false);
	assertEquals(sink.defs.length, 2);
});

Deno.test("createStyleSink honors well-known names and per-family prefixes", () => {
	const sink = createStyleSink({
		prefix: { text: "T", paragraph: "P" },
		name: (style) => style.blockRole === "heading" ? `Heading_20_${style.headingLevel}` : undefined,
	});
	assertEquals(sink.ensure({ blockRole: "heading", headingLevel: 2 }, "paragraph"), "Heading_20_2");
	assertEquals(sink.ensure({ bold: true }, "text"), "T1");
	assertEquals(sink.ensure({ align: "c" }, "paragraph"), "P1");
});

Deno.test("createResourceSink dedups by target and type", () => {
	const sink = createResourceSink();
	assertEquals(sink.ensure("http://x", "hyperlink"), "rId1");
	assertEquals(sink.ensure("http://x", "hyperlink"), "rId1");
	assertEquals(sink.ensure("http://y", "hyperlink"), "rId2");
	// Same target, different relationship type: a distinct entry.
	assertEquals(sink.ensure("http://x", "image"), "rId3");
	assertEquals(sink.entries.length, 3);
});
