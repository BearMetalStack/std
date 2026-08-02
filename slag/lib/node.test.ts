import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import { SlagDocument } from "./document.ts";
import { SlagText } from "./node.ts";

function setup() {
	const document = new SlagDocument();
	return { document, root: document.body };
}

Deno.test("inserting a fragment moves its children and empties it", () => {
	const { document, root } = setup();
	const fragment = document.createDocumentFragment();
	fragment.appendChild(document.createElement("b"));
	fragment.appendChild(document.createElement("i"));

	root.appendChild(fragment);

	assertEquals(fragment.childNodes.length, 0, "the fragment is left empty");
	assertEquals(root.childNodes.length, 2);
	assertEquals(root.innerHTML, "<b></b><i></i>");
});

Deno.test("insertion detaches the node from its previous parent", () => {
	const { document, root } = setup();
	const first = document.createElement("div");
	const second = document.createElement("div");
	const child = document.createElement("span");
	root.append(first, second);

	first.appendChild(child);
	second.appendChild(child);

	assertEquals(first.childNodes.length, 0);
	assertStrictEquals(child.parentNode, second);
});

Deno.test("insertBefore positions relative to the reference node", () => {
	const { document, root } = setup();
	const a = document.createElement("a");
	const c = document.createElement("c");
	root.append(a, c);

	const b = document.createElement("b");
	root.insertBefore(b, c);

	assertEquals(root.innerHTML, "<a></a><b></b><c></c>");
	assertStrictEquals(a.nextElementSibling, b);
	assertStrictEquals(c.previousElementSibling, b);
});

Deno.test("insertBefore rejects a reference node from another parent", () => {
	const { document, root } = setup();
	const other = document.createElement("div");
	const stranger = document.createElement("span");
	other.appendChild(stranger);

	assertThrows(
		() => root.insertBefore(document.createElement("i"), stranger),
		Error,
		"not a child",
	);
});

Deno.test("insertBefore rejects an insertion that would create a cycle", () => {
	const { document, root } = setup();
	const child = document.createElement("div");
	root.appendChild(child);

	assertThrows(() => child.appendChild(root), Error, "contains the parent");
});

Deno.test("removeChild rejects a node that is not a child", () => {
	const { document, root } = setup();
	assertThrows(() => root.removeChild(document.createElement("div")), Error, "not a child");
});

Deno.test("after() keeps multiple inserted nodes in order", () => {
	const { document, root } = setup();
	const anchor = document.createElement("a");
	root.appendChild(anchor);

	anchor.after(document.createElement("b"), document.createElement("c"));

	assertEquals(root.innerHTML, "<a></a><b></b><c></c>");
});

Deno.test("replaceChildren clears then appends, and coerces strings", () => {
	const { document, root } = setup();
	root.appendChild(document.createElement("old"));

	root.replaceChildren(document.createElement("new"), "tail");

	assertEquals(root.innerHTML, "<new></new>tail");
});

Deno.test("replaceWith swaps a node for its replacements", () => {
	const { document, root } = setup();
	const target = document.createElement("b");
	root.append(document.createElement("a"), target, document.createElement("c"));

	target.replaceWith(document.createElement("x"), document.createElement("y"));

	assertEquals(root.innerHTML, "<a></a><x></x><y></y><c></c>");
});

Deno.test("textContent reads the whole subtree and replaces it on write", () => {
	const { document, root } = setup();
	const outer = document.createElement("p");
	const inner = document.createElement("em");
	inner.appendChild(new SlagText("world"));
	outer.append(new SlagText("hello "), inner);
	root.appendChild(outer);

	assertEquals(outer.textContent, "hello world");

	outer.textContent = "replaced";
	assertEquals(outer.childNodes.length, 1);
	assertEquals(outer.innerHTML, "replaced");
});

Deno.test("isConnected follows the document, including through a shadow root", () => {
	const { document, root } = setup();
	const host = document.createElement("div");
	const shadow = host.attachShadow({ mode: "open" });
	const inShadow = document.createElement("span");
	shadow.appendChild(inShadow);

	assertEquals(inShadow.isConnected, false, "detached host means detached shadow content");

	root.appendChild(host);
	assertEquals(inShadow.isConnected, true, "the shadow root reaches the document via its host");

	host.remove();
	assertEquals(inShadow.isConnected, false);
});

Deno.test("contains covers self and descendants", () => {
	const { document, root } = setup();
	const parent = document.createElement("div");
	const child = document.createElement("span");
	parent.appendChild(child);
	root.appendChild(parent);

	assertEquals(parent.contains(parent), true);
	assertEquals(parent.contains(child), true);
	assertEquals(child.contains(parent), false);
	assertEquals(parent.contains(null), false);
});

Deno.test("cloneNode(true) copies attributes and the subtree", () => {
	const { document } = setup();
	const original = document.createElement("div");
	original.setAttribute("id", "one");
	original.appendChild(document.createElement("span"));

	const shallow = original.cloneNode();
	const deep = original.cloneNode(true);

	assertEquals(shallow.getAttribute("id"), "one");
	assertEquals(shallow.childNodes.length, 0);
	assertEquals(deep.innerHTML, "<span></span>");
});
