import "./_test_dom.ts";
import { assertEquals, assertStrictEquals } from "@std/assert";
import { jsx, setEffectImpl } from "../client/jsx-runtime.ts";

// A manual reactive harness: an effect runs once and re-runs whenever any test
// signal changes. Enough to drive appendReactiveChild without the signals lib,
// keeping the jsx package's tests dependency-free.
const runners = new Set<() => void>();
setEffectImpl((fn) => {
	fn();
	runners.add(fn as () => void);
	return () => runners.delete(fn as () => void);
});
function tick() {
	for (const r of [...runners]) r();
}

function signal<T>(initial: T): { get: () => T; set: (v: T) => void } {
	let value = initial;
	return {
		get: () => value,
		set: (v: T) => {
			value = v;
			tick();
		},
	};
}

// deno-lint-ignore no-explicit-any
type El = { innerHTML: string; childNodes: any[] };

Deno.test("reactive child swaps a DocumentFragment value and keeps updating", () => {
	const mode = signal("a");
	// A computed-like value that resolves to a fragment (a component's `<>...</>`)
	// or null — the shape a Switch/Show branch produces.
	const view = {
		get() {
			if (mode.get() !== "a") return null;
			const frag = document.createDocumentFragment();
			const d = document.createElement("div");
			d.textContent = "DRAFT";
			frag.appendChild(d);
			return frag;
		},
	};

	const container = jsx("div", { children: view }) as unknown as El;

	assertEquals(container.innerHTML, "<div>DRAFT</div>", "initial fragment renders");
	mode.set("b");
	assertEquals(container.innerHTML, "", "switching away clears the fragment content");
	mode.set("a");
	assertEquals(
		container.innerHTML,
		"<div>DRAFT</div>",
		"switching back re-renders (this was the bug)",
	);
});

Deno.test("reactive child updates text in place, then transitions text<->node", () => {
	const val = signal<unknown>("hello");
	const s = { get: () => val.get() };
	const container = jsx("div", { children: s }) as unknown as El;

	assertEquals(container.innerHTML, "hello");
	const textNode = container.childNodes[1];
	val.set("world");
	assertEquals(container.innerHTML, "world");
	assertStrictEquals(
		container.childNodes[1],
		textNode,
		"text updates reuse the same node (fast path)",
	);

	const span = document.createElement("span");
	span.textContent = "X";
	val.set(span);
	assertEquals(container.innerHTML, "<span>X</span>", "text -> element node");

	val.set("bye");
	assertEquals(container.innerHTML, "bye", "element node -> text");

	val.set(null);
	assertEquals(container.innerHTML, "", "null clears the range");
});
