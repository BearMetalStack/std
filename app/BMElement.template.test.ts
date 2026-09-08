// The DOM here is @bearmetal/slag. The side-effect import must stay first: `BMC`
// captures `globalThis.HTMLElement` as its base class when `@bearmetal/jsx` is
// evaluated, which happens on the `./BMElement.ts` import below.
//
// These two cases used to fail. The previous shim had no `querySelectorAll`, so
// `connectedCallback`'s `[ref]` scan threw, its own `try/catch` swallowed the
// error, and the template was never appended — the assertion saw an empty host
// and blamed the template. Slag has the method, so the component actually mounts.
import "@bearmetal/slag/global";
import { assert, assertEquals, assertExists, assertStrictEquals } from "@std/assert";
import { setCurrentOwner } from "@bearmetal/jsx";
import { jsx } from "@bearmetal/jsx/jsx-runtime";
import { createRoot } from "@bearmetal/slag/testing";
import type { SlagElement } from "@bearmetal/slag";
import { BMElement } from "./BMElement.ts";
import { define } from "./define.ts";
import { createComputed, createSignal, flushEffects } from "./signals.ts";
import type { BMTemplate } from "./types.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

let tagCounter = 0;
function freshTag(): string {
	return `bm-template-test-${++tagCounter}`;
}

/** Connects a real instance of `tag` and hands back the mounted element. */
function mount(tag: string): SlagElement {
	const root = createRoot();
	const el = document.createElement(tag) as unknown as SlagElement;
	root.appendChild(el);
	return el;
}

Deno.test("template returning a computed that yields an element renders", () => {
	setCurrentOwner(null);

	@define(freshTag())
	class C extends BMElement {
		protected override get template(): BMTemplate {
			return createComputed(() => {
				const d = document.createElement("div");
				d.textContent = "ELEM";
				return d as unknown as Node;
			}) as unknown as BMTemplate;
		}
	}

	assertEquals(mount(C.tag).innerHTML, "<div>ELEM</div>");
});

Deno.test("template returning a computed that yields a fragment renders and stays reactive", async () => {
	setCurrentOwner(null);
	const s = createSignal(0);

	@define(freshTag())
	class C extends BMElement {
		protected override get template(): BMTemplate {
			return createComputed(() => {
				const frag = document.createDocumentFragment();
				const d = document.createElement("div");
				d.textContent = `FRAG ${s.get()}`;
				frag.appendChild(d);
				return frag as unknown as Node;
			}) as unknown as BMTemplate;
		}
	}

	const el = mount(C.tag);
	assertEquals(el.innerHTML, "<div>FRAG 0</div>", "initial fragment content renders");

	s.set(1);
	await flush();
	assertEquals(el.innerHTML, "<div>FRAG 1</div>", "fragment template stays reactive");
});

Deno.test("a static fragment template survives a store update init() read", async () => {
	// The failure this pins: `init()` used to run *inside* the template's
	// reactive effect, so a signal it touched became a dependency of the mount.
	// When that signal later resolved — an `await`ed fetch writing back, say —
	// the effect re-ran and re-appended the very DocumentFragment whose contents
	// the first append had already moved out. The component blanked itself and
	// re-ran `init`, on the same instance.
	setCurrentOwner(null);
	const store = createSignal("a");
	let inits = 0;

	@define(freshTag())
	class C extends BMElement {
		protected override get template(): BMTemplate {
			const frag = document.createDocumentFragment();
			const a = document.createElement("div");
			a.textContent = "A";
			const b = document.createElement("div");
			b.textContent = "B";
			frag.append(a, b);
			return frag as unknown as BMTemplate;
		}
		protected override init() {
			inits++;
			store.get();
		}
	}

	const el = mount(C.tag);
	assertEquals(el.innerHTML, "<div>A</div><div>B</div>");
	assertEquals(inits, 1);

	store.set("b");
	await flush();

	assertEquals(el.innerHTML, "<div>A</div><div>B</div>", "content must survive");
	assertEquals(inits, 1, "init() is documented to run once");
});

Deno.test("init() reads never make the template reactive to them", async () => {
	setCurrentOwner(null);
	const store = createSignal(0);
	let renders = 0;

	@define(freshTag())
	class C extends BMElement {
		protected override get template(): BMTemplate {
			renders++;
			const d = document.createElement("div");
			d.textContent = "STATIC";
			return d as unknown as BMTemplate;
		}
		protected override init() {
			store.get();
		}
	}

	const el = mount(C.tag);
	assertEquals(renders, 1);

	store.set(1);
	await flush();

	assertEquals(el.innerHTML, "<div>STATIC</div>");
	assertEquals(renders, 1, "a static template renders once, whatever init() read");
});

Deno.test("init() runs once per connection across a reactive template's re-renders", async () => {
	setCurrentOwner(null);
	const s = createSignal(0);
	let inits = 0;

	@define(freshTag())
	class C extends BMElement {
		protected override get template(): BMTemplate {
			return createComputed(() => {
				const d = document.createElement("div");
				d.textContent = `V${s.get()}`;
				return d as unknown as Node;
			}) as unknown as BMTemplate;
		}
		protected override init() {
			inits++;
		}
	}

	const el = mount(C.tag);
	assertEquals(inits, 1);

	s.set(1);
	await flush();
	assertEquals(el.innerHTML, "<div>V1</div>", "still reactive");
	assertEquals(inits, 1, "but init() does not re-run on every re-render");
});

Deno.test("init() runs for a component with no template at all", () => {
	setCurrentOwner(null);
	let inits = 0;

	@define(freshTag())
	class C extends BMElement {
		protected override init() {
			inits++;
		}
	}

	mount(C.tag);
	assertEquals(inits, 1, "a component may be pure behaviour with nothing to render");
});

Deno.test("init() can reach refs via an effect, once the template registers them", async () => {
	// Refs are Signal.State now, so there's no ordering guarantee to pin: an
	// effect registered in init() just re-runs once #registerRefs() sets it,
	// the same as any other signal.
	setCurrentOwner(null);
	let seen: Element | undefined;

	@define(freshTag())
	class C extends BMElement {
		protected override get template(): BMTemplate {
			const wrap = document.createElement("div");
			const input = document.createElement("input");
			input.setAttribute("ref", "field");
			wrap.appendChild(input);
			return wrap as unknown as BMTemplate;
		}
		protected override init() {
			this.addEffect(() => {
				seen = this.refs.field.get();
			});
		}
	}

	mount(C.tag);
	await flush();
	assertExists(seen, "an effect reading this.refs.field.get() observes it once render completes");
});

Deno.test("a conditionally-rendered ref appears and disappears as its effect observes it", async () => {
	setCurrentOwner(null);
	const show = createSignal(true);
	const seen: Array<Element | undefined> = [];

	@define(freshTag())
	class C extends BMElement {
		protected override get template(): BMTemplate {
			return createComputed(() => {
				if (!show.get()) return document.createElement("div");
				const wrap = document.createElement("div");
				const input = document.createElement("input");
				input.setAttribute("ref", "field");
				wrap.appendChild(input);
				return wrap as unknown as Node;
			}) as unknown as BMTemplate;
		}
		protected override init() {
			this.addEffect(() => {
				seen.push(this.refs.field.get());
			});
		}
	}

	mount(C.tag);
	await flush();
	assertExists(seen.at(-1), "ref is set once the conditional template first renders it");

	show.set(false);
	flushEffects();
	assertEquals(seen.at(-1), undefined, "ref resets to undefined once its element disappears");

	show.set(true);
	flushEffects();
	assertExists(seen.at(-1), "ref is set again once the element reappears");
});

Deno.test("a ref signal keeps its identity across a reactive template's re-renders", async () => {
	setCurrentOwner(null);
	const s = createSignal(0);

	@define(freshTag())
	class C extends BMElement {
		protected override get template(): BMTemplate {
			return createComputed(() => {
				const wrap = document.createElement("div");
				const input = document.createElement("input");
				input.setAttribute("ref", "field");
				input.setAttribute("data-n", String(s.get()));
				wrap.appendChild(input);
				return wrap as unknown as Node;
			}) as unknown as BMTemplate;
		}
	}

	const el = mount(C.tag) as unknown as C;
	await flush();
	const firstElement = el.refs.field.get();
	const firstSignal = el.refs.field;

	s.set(1);
	await flush();
	const secondElement = el.refs.field.get();

	assertStrictEquals(
		firstSignal,
		el.refs.field,
		"the ref signal object itself is stable across re-renders",
	);
	assert(firstElement !== secondElement, "the template did produce a new element each render");
});

// The JSX runtime registers a `ref=` prop by calling the owner's registerRef
// directly and leaves no attribute on the element. #registerRefs walks the
// mounted tree for `[ref]` attributes and won't see those, so its stale-ref
// sweep has to recognise a JSX-registered ref by its element still being in the
// tree — otherwise it clears the ref it was just handed.

Deno.test("a ref declared through the JSX runtime is not cleared by #registerRefs", async () => {
	setCurrentOwner(null);

	@define(freshTag())
	class C extends BMElement {
		protected override get template(): BMTemplate {
			return jsx("div", {
				children: jsx("input", { ref: "field" }),
			}) as unknown as BMTemplate;
		}
	}

	const el = mount(C.tag) as unknown as C;
	await flush();
	assertExists(el.refs.field.get(), "the JSX-declared ref survives the mount");
});

Deno.test("a JSX ref in a reactive template survives its own re-renders", async () => {
	setCurrentOwner(null);
	const n = createSignal(0);

	@define(freshTag())
	class C extends BMElement {
		protected override get template(): BMTemplate {
			return createComputed(() =>
				jsx("div", {
					children: jsx("input", { ref: "field", "data-n": String(n.get()) }),
				})
			) as unknown as BMTemplate;
		}
	}

	const el = mount(C.tag) as unknown as C;
	await flush();
	const first = el.refs.field.get();
	assertExists(first, "JSX ref set on the first render");

	n.set(1);
	await flush();
	const second = el.refs.field.get();
	assertExists(second, "JSX ref still set after a re-render");
	assert(first !== second, "the template produced a new element");
});

Deno.test("a JSX ref still resets to undefined when its element stops rendering", async () => {
	setCurrentOwner(null);
	const show = createSignal(true);

	@define(freshTag())
	class C extends BMElement {
		protected override get template(): BMTemplate {
			return createComputed(() =>
				show.get() ? jsx("div", { children: jsx("input", { ref: "field" }) }) : jsx("div", {})
			) as unknown as BMTemplate;
		}
	}

	const el = mount(C.tag) as unknown as C;
	await flush();
	assertExists(el.refs.field.get(), "ref is set while its element renders");

	show.set(false);
	flushEffects();
	assertEquals(el.refs.field.get(), undefined, "ref resets once its element is gone");
});
