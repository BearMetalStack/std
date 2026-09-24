// The DOM here is @bearmetal/slag — the same one a server render uses, so these
// tests exercise the real thing rather than a shim that agrees with it by
// accident. Installing it inside the file body is fine now: nothing in this
// package captures a DOM global at module-evaluation time.
import { installGlobals } from "@bearmetal/slag";
installGlobals();

import { assert, assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import {
	Fragment,
	jsx,
	registerPropHandler,
	setCurrentOwner,
	setEffectImpl,
	setUntrackImpl,
} from "../jsx-runtime.ts";
import { BMC } from "./bmc.ts";
import { Html } from "./html.ts";
import { beginRenderScope, collectInto, endRenderScope } from "./pending.ts";

// A manual reactive harness: an effect runs once and re-runs whenever any test
// signal changes. Enough to drive appendReactiveChild without the signals lib,
// keeping the jsx package's runtime dependencies at zero.
const runners = new Set<() => void>();
setEffectImpl((fn) => {
	// Cleanup handling mirrors `@bearmetal/app`'s `effect()`: the previous run's
	// cleanup fires before each re-run, and once more when the effect is
	// disposed. Prop handlers rely on that, so the harness has to honour it.
	let cleanup: (() => void) | void;
	const run = () => {
		if (typeof cleanup === "function") cleanup();
		cleanup = fn();
	};
	run();
	runners.add(run);
	return () => {
		runners.delete(run);
		if (typeof cleanup === "function") cleanup();
	};
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

Deno.test("a registered prop handler takes the prop over from the runtime", () => {
	const seen: Array<[string, unknown, string]> = [];
	const unregister = registerPropHandler("contextMenu", (el, value, key) => {
		seen.push([(el as unknown as { tagName: string }).tagName, value, key]);
	});

	const menu = { items: ["open"] };
	const el = jsx("div", { contextMenu: menu, id: "x" }) as unknown as {
		getAttribute(name: string): string | null;
	};

	assertEquals(seen.length, 1);
	assertEquals(seen[0][2], "contextMenu", "the handler is told which prop it was called for");
	assertStrictEquals(seen[0][1], menu, "the value reaches the handler untouched");
	assertEquals(el.getAttribute("contextMenu"), null, "the runtime sets no attribute of its own");
	assertEquals(el.getAttribute("id"), "x", "other props are unaffected");

	unregister();
	const plain = jsx("div", { contextMenu: "menu-id" }) as unknown as {
		getAttribute(name: string): string | null;
	};
	assertEquals(seen.length, 1, "an unregistered handler stops being called");
	assertEquals(plain.getAttribute("contextMenu"), "menu-id", "default handling comes back");
});

Deno.test("a handled prop tracks a signal value, and its cleanup runs between updates", () => {
	const values: unknown[] = [];
	const cleanups: unknown[] = [];
	const unregister = registerPropHandler("contextMenu", (_el, value) => {
		values.push(value);
		return () => cleanups.push(value);
	});

	const menu = signal("a");
	jsx("div", { contextMenu: menu });

	assertEquals(values, ["a"], "the signal is unwrapped for the handler");
	menu.set("b");
	assertEquals(values, ["a", "b"], "a change re-runs the handler");
	assertEquals(cleanups, ["a"], "the previous run is cleaned up first");

	unregister();
});

Deno.test("a raw prop handler receives the signal itself", () => {
	const seen: unknown[] = [];
	const unregister = registerPropHandler("$menu", (_el, value) => {
		seen.push(value);
	}, { raw: true });

	const menu = signal("a");
	jsx("div", { $menu: menu });
	menu.set("b");

	assertEquals(seen.length, 1, "nothing is tracked on the handler's behalf");
	assertStrictEquals(seen[0], menu, "the handler gets the signal to subscribe to itself");

	unregister();
});

Deno.test("a handler's cleanup is registered with the owning component", () => {
	const cleanups: Array<() => void> = [];
	setCurrentOwner({ registerCleanup: (fn) => cleanups.push(fn) });

	let disposed = false;
	const unregister = registerPropHandler("contextMenu", () => {
		return () => {
			disposed = true;
		};
	});

	jsx("div", { contextMenu: { items: [] } });
	assertEquals(cleanups.length, 1, "the returned function is handed to the owner");
	cleanups[0]();
	assert(disposed, "disposing the owner tears the handler's work down");

	unregister();
	setCurrentOwner(null);
});

Deno.test("claiming a prop twice is an error, and re-registering the same handler is not", () => {
	const handler = () => {};
	const unregister = registerPropHandler("contextMenu", handler);

	registerPropHandler("contextMenu", handler); // a module evaluated twice

	assertThrows(
		() => registerPropHandler("contextMenu", () => {}),
		Error,
		"already registered",
	);
	assertThrows(
		() => registerPropHandler("ref", () => {}),
		Error,
		"reserved",
	);

	unregister();
	registerPropHandler("contextMenu", () => {})();
});

// -- form control values --

function html(node: unknown): string {
	return (node as { outerHTML: string }).outerHTML;
}

Deno.test("value on an input serializes as its value attribute", () => {
	const input = jsx("input", { value: "Invalid" });
	assertEquals(html(input), '<input value="Invalid">');
	assertEquals((input as unknown as HTMLInputElement).value, "Invalid");
});

Deno.test("value on a select marks the matching option selected", () => {
	const select = jsx("select", {
		value: "b",
		children: [
			jsx("option", { value: "a", children: "A" }),
			jsx("option", { value: "b", children: "B" }),
			jsx("option", { children: "c" }),
		],
	});
	assertEquals(
		html(select),
		'<select><option value="a">A</option><option value="b" selected>B</option><option>c</option></select>',
	);
});

Deno.test("value on a textarea serializes as its text", () => {
	assertEquals(html(jsx("textarea", { value: "a < b" })), "<textarea>a &lt; b</textarea>");
});

Deno.test("a signal value keeps the attribute in step", () => {
	const value = signal("one");
	const input = jsx("input", { value });
	value.set("two");
	assertEquals(html(input), '<input value="two">');
});

Deno.test("$bind serializes the bound value and checkedness", () => {
	const text = signal("hello");
	const on = signal(true);
	const input = jsx("input", { $bind: text });
	const box = jsx("input", { type: "checkbox", $bind: on });
	assertEquals(html(input), '<input value="hello">');
	assertEquals(html(box), '<input type="checkbox" checked>');
	on.set(false);
	assertEquals(html(box), '<input type="checkbox">');
});
