// The DOM here is @bearmetal/slag. The side-effect import must stay first: `BMC`
// captures `globalThis.HTMLElement` as its base class when `@bearmetal/jsx` is
// evaluated, which happens on the `./BMElement.ts` import below.
//
// These two cases used to fail. The previous shim had no `querySelectorAll`, so
// `connectedCallback`'s `[ref]` scan threw, its own `try/catch` swallowed the
// error, and the template was never appended — the assertion saw an empty host
// and blamed the template. Slag has the method, so the component actually mounts.
import "@bearmetal/slag/global";
import { assertEquals } from "@std/assert";
import { setCurrentOwner } from "@bearmetal/jsx/client";
import { createRoot } from "@bearmetal/slag/testing";
import type { SlagElement } from "@bearmetal/slag";
import { BMElement } from "./BMElement.ts";
import { define } from "./define.ts";
import { createComputed, createSignal } from "./signals.ts";
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
