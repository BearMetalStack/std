import { assertEquals } from "@std/assert";
import { hasClass, on, onStyle, textMatches, xmlToMarkdown } from "./mod.ts";
import type { Profile } from "./mod.ts";
import { defaultRules } from "./rules/mod.ts";
import type { AnyReverseRule } from "./types.ts";

function profile(rules: AnyReverseRule[], mode: "xml" | "html" = "xml"): Profile {
	return { name: "test", parse: { mode }, rules: [...rules, ...defaultRules()] };
}

function run(src: string, rules: AnyReverseRule[], mode: "xml" | "html" = "xml"): string {
	return xmlToMarkdown(src, profile(rules, mode)).trim();
}

Deno.test("dsl: on().wrap() emits a node and recurses", () => {
	assertEquals(run("<doc><t>hi</t></doc>", [on("t").wrap("md:heading", { level: 2 })]), "## hi");
});

Deno.test("dsl: on().emit() consumes the subtree", () => {
	const rules = [on("ref").emit("md:footnote", (el) => ({ id: el.attrs.get("id") ?? "" }))];
	assertEquals(run(`<doc><ref id="7">ignored</ref></doc>`, rules), "[^7]");
});

Deno.test("dsl: drop and unwrap", () => {
	assertEquals(run("<doc><skip>x</skip>y</doc>", [on("skip").drop()]), "y");
	assertEquals(run("<doc><bare>x</bare>y</doc>", [on("bare").unwrap()]), "xy");
});

Deno.test("dsl: raw emits the element verbatim", () => {
	assertEquals(run("<doc><keep a='1'/></doc>", [on("keep").raw()]), `<keep a="1"/>`);
});

Deno.test("dsl: multiple tags share one rule", () => {
	const rules = [on(["b1", "b2"]).wrap("md:bold")];
	assertEquals(run("<doc><b1>a</b1><b2>b</b2></doc>", rules), "**a****b**");
});

Deno.test("dsl: where() predicates are ANDed", () => {
	const rules = [
		on("p").where(hasClass("q")).wrap("md:blockquote"),
		on("p").wrap("core:paragraph"),
	];
	assertEquals(run(`<doc><p class="q">a</p><p>b</p></doc>`, rules, "html"), "> a\n\nb");
});

Deno.test("dsl: array order is precedence", () => {
	// The first matching rule wins, exactly as in Lexer.#matchRule.
	const first = [on("x").wrap("md:bold"), on("x").wrap("md:italic")];
	assertEquals(run("<doc><x>a</x></doc>", first), "**a**");
	const flipped = [on("x").wrap("md:italic"), on("x").wrap("md:bold")];
	assertEquals(run("<doc><x>a</x></doc>", flipped), "*a*");
});

Deno.test("dsl: a wildcard rule is consulted for every element", () => {
	const rules = [onStyle(() => false).drop(), on("*").unwrap()];
	assertEquals(run("<doc><anything>a</anything></doc>", rules), "a");
});

Deno.test("dsl: whereNot inverts", () => {
	const rules = [on("p").whereNot(hasClass("skip")).wrap("core:paragraph"), on("p").drop()];
	assertEquals(run(`<doc><p>a</p><p class="skip">b</p></doc>`, rules, "html"), "a");
});

Deno.test("dsl: textMatches inspects flattened content", () => {
	const rules = [on("p").where(textMatches(/^!/)).drop(), on("p").wrap("core:paragraph")];
	assertEquals(run("<doc><p>!hidden</p><p>shown</p></doc>", rules, "html"), "shown");
});

Deno.test("dsl: a prefixed tag buckets on the local name and checks the URI", () => {
	const nsMap = { w: "urn:w" };
	const rules = [on("w:p", nsMap).wrap("md:heading", { level: 1 })];
	// Bound to the right URI: matches.
	assertEquals(run(`<doc xmlns:w="urn:w"><w:p>hi</w:p></doc>`, rules), "# hi");
	// Bound to a different URI: declines, and the default unwrap keeps the text.
	assertEquals(run(`<doc xmlns:w="urn:other"><w:p>hi</w:p></doc>`, rules), "hi");
});

Deno.test("dsl: an unbound prefix is accepted, since fragments often lack declarations", () => {
	const rules = [on("w:p", { w: "urn:w" }).wrap("md:heading", { level: 1 })];
	assertEquals(run("<doc><w:p>hi</w:p></doc>", rules), "# hi");
});

Deno.test("dsl: generated ids live in the rev: namespace", () => {
	// rev: ids can never collide with a node tag, which is what lets reverse
	// rules skip the forward contract entirely.
	assertEquals(on("x").drop().id.startsWith("rev:"), true);
	assertEquals(on("x").named("rev:custom").drop().id, "rev:custom");
});
