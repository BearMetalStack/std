/**
 * Compatibility coverage for the two reconciliation techniques this stack
 * already depends on. Neither is Slag's own code — they are reproduced here from
 * `jsx/lib/jsx.ts` (`appendReactiveChild`'s text-node marker range) and
 * `app/built-ins/For.ts` (`each`'s single anchor node) so that a change to the
 * microdom cannot quietly break the consumers it was built for.
 */

import { assertEquals, assertStrictEquals } from "@std/assert";
import { SlagDocument } from "./document.ts";
import type { SlagNode } from "./node.ts";

Deno.test("marker range: a fragment child can be cleared and re-rendered", () => {
	const document = new SlagDocument();
	const container = document.createElement("div");
	const start = document.createTextNode("");
	const end = document.createTextNode("");
	container.append(start, end);

	function clearRange() {
		const parent = end.parentNode!;
		let node = start.nextSibling;
		while (node && node !== end) {
			const next = node.nextSibling;
			parent.removeChild(node);
			node = next;
		}
	}

	function render(value: SlagNode | null) {
		const parent = end.parentNode!;
		clearRange();
		if (value) parent.insertBefore(value, end);
	}

	function draft() {
		const fragment = document.createDocumentFragment();
		const div = document.createElement("div");
		div.textContent = "DRAFT";
		fragment.appendChild(div);
		return fragment;
	}

	render(draft());
	assertEquals(container.innerHTML, "<div>DRAFT</div>", "initial fragment renders");

	render(null);
	assertEquals(container.innerHTML, "", "switching away clears the range");

	render(draft());
	assertEquals(container.innerHTML, "<div>DRAFT</div>", "switching back re-renders");
});

Deno.test("marker range: text updates reuse the same node", () => {
	const document = new SlagDocument();
	const container = document.createElement("div");
	const start = document.createTextNode("");
	const end = document.createTextNode("");
	container.append(start, end);

	function render(value: unknown) {
		const parent = end.parentNode!;
		if (value instanceof Object && "nodeType" in value) {
			let node = start.nextSibling;
			while (node && node !== end) {
				const next = node.nextSibling;
				parent.removeChild(node);
				node = next;
			}
			parent.insertBefore(value as SlagNode, end);
			return;
		}
		const text = value == null ? "" : String(value);
		const only = start.nextSibling;
		if (only && only.nextSibling === end && only.nodeType === 3) {
			(only as unknown as { data: string }).data = text;
			return;
		}
		let node = start.nextSibling;
		while (node && node !== end) {
			const next = node.nextSibling;
			parent.removeChild(node);
			node = next;
		}
		if (text !== "") parent.insertBefore(document.createTextNode(text), end);
	}

	render("hello");
	assertEquals(container.innerHTML, "hello");
	const textNode = container.childNodes[1];

	render("world");
	assertEquals(container.innerHTML, "world");
	assertStrictEquals(container.childNodes[1], textNode, "the fast path reuses the node");

	const span = document.createElement("span");
	span.textContent = "X";
	render(span);
	assertEquals(container.innerHTML, "<span>X</span>", "text -> element");

	render("bye");
	assertEquals(container.innerHTML, "bye", "element -> text");

	render(null);
	assertEquals(container.innerHTML, "", "null clears the range");
});

Deno.test("anchor: list items stay contiguous siblings around other content", () => {
	const document = new SlagDocument();
	const list = document.createElement("ul");
	list.appendChild(document.createElement("li")).textContent = "before";

	// `each()` returns a fragment carrying only its anchor; inserting the
	// fragment empties it and moves the anchor into the live parent, which is
	// thereafter always `anchor.parentNode`.
	const anchor = document.createTextNode("");
	const fragment = document.createDocumentFragment();
	fragment.append(anchor);
	list.appendChild(fragment);
	list.appendChild(document.createElement("li")).textContent = "after";

	assertEquals(fragment.childNodes.length, 0);
	assertStrictEquals(anchor.parentNode, list);

	const rendered: SlagNode[] = [];
	function reconcile(items: string[]) {
		for (const node of rendered) node.parentNode?.removeChild(node);
		rendered.length = 0;
		let previous: SlagNode = anchor;
		for (const item of items) {
			const li = document.createElement("li");
			li.textContent = item;
			previous.after(li);
			rendered.push(li);
			previous = li;
		}
	}

	reconcile(["a", "b"]);
	assertEquals(
		list.innerHTML,
		"<li>before</li><li>a</li><li>b</li><li>after</li>",
		"items land between the surrounding siblings",
	);

	reconcile(["c"]);
	assertEquals(list.innerHTML, "<li>before</li><li>c</li><li>after</li>");

	reconcile([]);
	assertEquals(list.innerHTML, "<li>before</li><li>after</li>");
});
