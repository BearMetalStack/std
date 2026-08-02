import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import { SlagDocument } from "./document.ts";
import type { SlagElement } from "./element.ts";

function tree() {
	const document = new SlagDocument();
	const section = document.createElement("section");
	section.setAttribute("id", "main");
	section.setAttribute("class", "panel wide");

	const first = document.createElement("input");
	first.setAttribute("ref", "name");
	const second = document.createElement("textarea");
	second.setAttribute("ref", "bio");
	const nested = document.createElement("div");
	nested.appendChild(second);
	section.append(first, nested);

	document.body.appendChild(section);
	return { document, section, first, second, nested };
}

Deno.test("querySelectorAll finds ref attributes anywhere in the subtree", () => {
	const { section, first, second } = tree();

	const found = section.querySelectorAll("[ref]");

	assertEquals(found.length, 2);
	assertStrictEquals(found[0], first);
	assertStrictEquals(found[1], second);
	assertEquals(found.map((el) => el.getAttribute("ref")), ["name", "bio"]);
});

Deno.test("head.querySelector('style#tag') resolves a tag-and-id compound", () => {
	const document = new SlagDocument();
	const style = document.createElement("style");
	style.setAttribute("id", "my-widget");
	document.head.appendChild(style);

	assertStrictEquals(document.head.querySelector("style#my-widget"), style);
	assertEquals(document.head.querySelector("style#other"), null);
	assertEquals(document.head.querySelector("link#my-widget"), null);
});

Deno.test("class and attribute-operator matchers", () => {
	const { document, section } = tree();
	const link = document.createElement("a");
	link.setAttribute("class", "btn primary");
	link.setAttribute("href", "https://example.com/docs");
	link.setAttribute("lang", "en-GB");
	section.appendChild(link);

	assertStrictEquals(section.querySelector(".primary"), link);
	assertStrictEquals(section.querySelector(".btn.primary"), link);
	assertEquals(section.querySelector(".btn.missing"), null);
	assertStrictEquals(section.querySelector('[href^="https://"]'), link);
	assertStrictEquals(section.querySelector('[href$="docs"]'), link);
	assertStrictEquals(section.querySelector('[href*="example"]'), link);
	assertStrictEquals(section.querySelector('[class~="primary"]'), link);
	assertStrictEquals(section.querySelector('[lang|="en"]'), link);
	assertEquals(section.querySelector('[lang|="fr"]'), null);
});

Deno.test("combinators", () => {
	const { section, first, second, nested } = tree();

	// Combinators look at the whole tree, not only inside the search root — so
	// `section >` can match here even though `section` is the root itself.
	assertStrictEquals(section.querySelector("section > input"), first);
	assertEquals(section.querySelector("section > textarea"), null, "> is not descendant");
	assertStrictEquals(section.querySelector("div > textarea"), second);
	assertStrictEquals(section.querySelector("section textarea"), second);
	assertStrictEquals(section.querySelector("input + div"), nested);
	assertStrictEquals(section.querySelector("input ~ div"), nested);
	assertEquals(section.querySelector("div + input"), null);
	assertStrictEquals(first.parentElement, section);
});

Deno.test("selector lists match any alternative, in tree order", () => {
	const { section } = tree();

	assertEquals(section.querySelectorAll("input, textarea").length, 2);
	assertEquals(section.querySelectorAll("input, nothing").length, 1);
});

Deno.test("matches and closest walk up from the element", () => {
	const { section, second, nested } = tree();

	assertEquals(second.matches("textarea[ref]"), true);
	assertEquals(second.matches("input"), false);
	assertStrictEquals(second.closest("div"), nested);
	assertStrictEquals(second.closest("#main"), section);
	assertEquals(second.closest("article"), null);
});

Deno.test(":scope is the element the query was run on", () => {
	const { section } = tree();

	assertEquals(section.querySelectorAll(":scope input").length, 1);
	assertEquals(section.matches(":scope"), true);
});

Deno.test("tag matching is case-insensitive for HTML", () => {
	const { section } = tree();
	assertEquals(section.querySelectorAll("INPUT").length, 1);
});

Deno.test("an unsupported pseudo-class throws and names the selector", () => {
	const { section } = tree();

	assertThrows(
		() => section.querySelector("input:nth-child"),
		Error,
		'does not support the pseudo-class ":nth-child" (in "input:nth-child")',
	);
});

Deno.test("raw markup is invisible to the selector engine", () => {
	const { document, section } = tree();
	const holder = document.createElement("div");
	holder.innerHTML = "<span id='hidden'></span>";
	section.appendChild(holder);

	assertEquals(section.querySelector("#hidden"), null);
	assertEquals(holder.innerHTML, "<span id='hidden'></span>", "but it still serializes");
});

Deno.test("getElementById searches the whole document", () => {
	const { document, section } = tree();
	assertStrictEquals(document.getElementById("main") as SlagElement, section);
	assertEquals(document.getElementById("absent"), null);
});
