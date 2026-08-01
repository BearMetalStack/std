import { assertEquals } from "@std/assert";
import { setCurrentOwner } from "@bearmetal/jsx/client";
import { BMElement } from "./BMElement.ts";
import { createComputed, createSignal } from "./signals.ts";
import type { BMTemplate } from "./types.ts";
import { installTestDom, TElement } from "./_test_dom.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

// deno-lint-ignore no-explicit-any
function mountable<T extends BMElement>(el: T): T & { innerHTML: string; childNodes: any[] } {
	const backing = new TElement("host");
	Object.assign(el, {
		dataset: {},
		hasChildNodes: () => backing.hasChildNodes(),
		appendChild: (n: any) => backing.appendChild(n),
		replaceChildren: (...n: any[]) => backing.replaceChildren(...n),
	});
	Object.defineProperties(el, {
		childNodes: { get: () => backing.childNodes, configurable: true },
		firstChild: { get: () => backing.firstChild, configurable: true },
		innerHTML: { get: () => backing.innerHTML, configurable: true },
	});
	// deno-lint-ignore no-explicit-any
	return el as any;
}

Deno.test("template returning a computed that yields an element renders", () => {
	const restore = installTestDom();
	setCurrentOwner(null);
	try {
		class C extends BMElement {
			protected override get template(): BMTemplate {
				return createComputed(() => {
					const d = document.createElement("div");
					d.textContent = "ELEM";
					return d as unknown as Node;
				}) as unknown as BMTemplate;
			}
		}
		const el = mountable(new C());
		el.connectedCallback();
		assertEquals(el.innerHTML, "<div>ELEM</div>");
	} finally {
		restore();
	}
});

Deno.test("template returning a computed that yields a fragment renders and stays reactive", async () => {
	const restore = installTestDom();
	setCurrentOwner(null);
	try {
		const s = createSignal(0);
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
		const el = mountable(new C());
		el.connectedCallback();
		assertEquals(el.innerHTML, "<div>FRAG 0</div>", "initial fragment content renders");
		s.set(1);
		await flush();
		assertEquals(el.innerHTML, "<div>FRAG 1</div>", "fragment template stays reactive");
	} finally {
		restore();
	}
});
