import { assertEquals, assertStrictEquals } from "@std/assert";
import { installGlobals } from "./lib/global.ts";
import { SlagDocument } from "./lib/document.ts";
import { SlagHTMLElement } from "./lib/element.ts";

// deno-lint-ignore no-explicit-any
const global = globalThis as any;

Deno.test("installGlobals installs a working document and restores on teardown", () => {
	const hadDocument = "document" in global;
	const restore = installGlobals();
	try {
		assertEquals(typeof document, "object");
		const element = document.createElement("p");
		element.textContent = "hi";
		assertEquals(element.toString(), "<p>hi</p>");
		assertEquals(document.body.isConnected, true);
	} finally {
		restore();
	}

	assertEquals("document" in global, hadDocument, "teardown restores the prior state exactly");
});

Deno.test("teardown puts an existing global back rather than deleting it", () => {
	const sentinel = { marker: "previous shim" };
	global.document = sentinel;

	const restore = installGlobals();
	assertEquals(global.document instanceof SlagDocument, true);
	restore();

	assertStrictEquals(global.document, sentinel);
	delete global.document;
});

Deno.test("installGlobals accepts a caller-supplied document", () => {
	const own = new SlagDocument();
	const restore = installGlobals({ document: own });
	try {
		assertStrictEquals(global.document, own);
		assertStrictEquals(global.window.document, own);
	} finally {
		restore();
	}
});

Deno.test("the installed constructors are the ones custom elements extend", () => {
	const restore = installGlobals();
	try {
		assertStrictEquals(global.HTMLElement, SlagHTMLElement);
		assertEquals(document.createElement("div") instanceof global.HTMLElement, true);
		assertEquals(document.createDocumentFragment() instanceof global.DocumentFragment, true);
		assertEquals(document.createTextNode("x") instanceof global.Node, true);
	} finally {
		restore();
	}
});

Deno.test("window shims answer instead of throwing", () => {
	const restore = installGlobals();
	try {
		assertEquals(global.window.matchMedia("(min-width: 40em)").matches, false);
		const element = document.createElement("div");
		element.style.color = "red";
		assertEquals(global.window.getComputedStyle(element).color, "red");
	} finally {
		restore();
	}
});
