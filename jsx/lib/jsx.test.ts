// The DOM here is @bearmetal/slag — the same one a server render uses, so these
// tests exercise the real thing rather than a shim that agrees with it by
// accident. Installing it inside the file body is fine now: nothing in this
// package captures a DOM global at module-evaluation time.
import { installGlobals } from "@bearmetal/slag";
installGlobals();

import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { Fragment, jsx, setEffectImpl, setUntrackImpl } from "../jsx-runtime.ts";
import { BMC } from "./bmc.ts";
import { Html } from "./html.ts";
import { beginRenderScope, collectInto, endRenderScope } from "./pending.ts";

// A manual reactive harness: an effect runs once and re-runs whenever any test
// signal changes. Enough to drive appendReactiveChild without the signals lib,
// keeping the jsx package's runtime dependencies at zero.
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

Deno.test("re-rendering to the same node leaves it in the DOM untouched", () => {
	// A signal that recomputes to the value it already had — a memoised branch, or
	// a route whose params changed but whose component did not. Removing and
	// re-inserting an identical node is not a no-op in a real DOM: it restarts
	// animations, drops focus, reloads iframes, and fires disconnect/connect on
	// every custom element inside.
	const bump = signal(0);
	const stable = document.createElement("div");
	stable.textContent = "STABLE";
	const view = {
		get() {
			bump.get();
			return stable;
		},
	};

	const container = jsx("div", { children: view }) as unknown as El;
	assertEquals(container.innerHTML, "<div>STABLE</div>");

	let removals = 0;
	const realRemove = (container as unknown as { removeChild(n: unknown): unknown }).removeChild;
	(container as unknown as { removeChild(n: unknown): unknown }).removeChild = function (n) {
		removals++;
		return realRemove.call(this, n);
	};

	bump.set(1);
	bump.set(2);

	assertEquals(removals, 0, "an unchanged node should never be pulled out of the DOM");
	assertEquals(container.innerHTML, "<div>STABLE</div>");
	assertStrictEquals(container.childNodes[1], stable);
});

Deno.test("text children are escaped and Html children are not", () => {
	const container = jsx("div", {
		children: ["<b>plain</b>", new Html("<b>markup</b>")],
	}) as unknown as El;

	assertEquals(container.innerHTML, "&lt;b&gt;plain&lt;/b&gt;<b>markup</b>");
});

Deno.test("$raw treats string children as markup", () => {
	const container = jsx("div", {
		$raw: true,
		children: "<em>raw</em>",
	}) as unknown as El;

	assertEquals(container.innerHTML, "<em>raw</em>");
});

Deno.test("a reactive child carrying Html renders markup, not escaped text", () => {
	const val = signal(new Html("<i>one</i>"));
	const container = jsx("div", { children: { get: () => val.get() } }) as unknown as El;

	assertEquals(container.innerHTML, "<i>one</i>");
	val.set(new Html("<i>two</i>"));
	assertEquals(container.innerHTML, "<i>two</i>", "the old markup is replaced, not appended to");
});

Deno.test("a fragment flattens its children without a wrapper element", () => {
	const frag = Fragment({ children: ["a", jsx("b", { children: "c" })] });
	const container = jsx("div", { children: frag }) as unknown as El;

	assertEquals(container.innerHTML, "a<b>c</b>");
});

Deno.test("a promise child holds its place and fills in when it resolves", async () => {
	const container = jsx("div", {
		children: ["before", Promise.resolve(jsx("span", { children: "late" })), "after"],
	}) as unknown as El;

	assertEquals(container.innerHTML, "beforeafter", "the slot is empty until the promise settles");
	await new Promise((resolve) => setTimeout(resolve, 0));
	assertEquals(container.innerHTML, "before<span>late</span>after");
});

Deno.test("a render scope collects the promises raised while it is collecting", async () => {
	const scope = beginRenderScope();
	try {
		const { result, work } = collectInto(scope, () =>
			jsx("div", {
				children: Promise.resolve("resolved"),
			}) as unknown as El);

		assertEquals(work.length, 1, "the pending child registered itself with the open scope");
		assertEquals(result.innerHTML, "");

		await Promise.all(work);
		assertEquals(result.innerHTML, "resolved", "awaiting the scope's work settles the markup");

		assertEquals(
			collectInto(scope, () => {}).work.length,
			0,
			"work is drained as it is read, so a renderer can loop until there is none",
		);
	} finally {
		endRenderScope(scope);
	}
});

Deno.test("outside a render scope, nothing is collected", () => {
	// A browser is never inside a scope. The promise still resolves into place;
	// it is simply not something anyone waits for.
	const scope = beginRenderScope();
	endRenderScope(scope);

	jsx("div", { children: Promise.resolve("x") });
	assertEquals(scope.work.size, 0);
});

Deno.test("jsx() constructs a BMC element and applies its props inside the registered untrack", () => {
	// A real signals implementation (`@bearmetal/app`) registers `Signal.subtle.untrack`
	// here via `setUntrackImpl`. This pins the contract that implementation relies
	// on: constructing a component from JSX, and applying its initial props, both
	// happen *inside* whatever `untrack` was registered — so a signal read or
	// write during either is never observable as a dependency of an ambient
	// render.
	//
	// Without this, a component's own one-time bookkeeping read during
	// construction (`@prop()`'s type inference is the motivating case) or a
	// bare-value prop applied via `existing.set(val)` could wire that
	// component's own signal as the dependency of whatever `this.computed()`
	// happened to be building it — e.g. a parent's `template`, if the child is
	// constructed mid-render.
	let untrackDepth = 0;
	setUntrackImpl((fn) => {
		untrackDepth++;
		try {
			return fn();
		} finally {
			untrackDepth--;
		}
	});

	let depthAtConstructionRead = -1;
	let depthAtPropApplication = -1;

	class Probe extends BMC {
		static override tag = "jsx-untrack-probe";
		// A writable-signal-shaped prop, mirroring `@prop() accessor greeting =
		// this.signal(...)` — `applyProps` only reaches the `existing.set(val)`
		// branch for a bare-value prop when the current value already looks like
		// a signal.
		greeting = signal<string | null>(null);

		constructor() {
			super();
			// Mirrors `prop()`'s one-time type-inference read, made during
			// construction against a signal only just created.
			this.greeting.get();
			depthAtConstructionRead = untrackDepth;
			const originalSet = this.greeting.set;
			this.greeting.set = (v: string | null) => {
				originalSet(v);
				depthAtPropApplication = untrackDepth;
			};
		}
	}
	customElements.define(Probe.tag, Probe as unknown as CustomElementConstructor);

	jsx(Probe, { greeting: "hi", children: [] });

	assert(depthAtConstructionRead > 0, "construction must run inside the registered untrack");
	assert(
		depthAtPropApplication > 0,
		"applying a bare-value prop must run inside the registered untrack",
	);

	setUntrackImpl((fn) => fn());
});
