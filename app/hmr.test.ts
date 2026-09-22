// The DOM here is @bearmetal/slag; see the note in BMElement.test.ts.
import { installGlobals } from "@bearmetal/slag";
installGlobals();

import { assert, assertEquals, assertNotStrictEquals } from "@std/assert";
import { BMElement } from "./BMElement.ts";
import { HMR_EVENT, type HmrEventDetail, hotStandIn, hotSwap } from "./hmr.ts";
import { prop } from "./prop.ts";
import { state } from "./state.ts";

let nextTag = 0;

function register(ctor: { tag: string }): string {
	const tag = `hmr-el-${nextTag++}`;
	ctor.tag = tag;
	customElements.define(tag, hotStandIn(tag, ctor as unknown as CustomElementConstructor));
	return tag;
}

function mount(tag: string): HTMLElement {
	const el = document.createElement(tag);
	document.body.appendChild(el);
	return el;
}

Deno.test("a stand-in builds instances of the class it stands in for", () => {
	class Before extends BMElement {
		#label = "before";
		get label() {
			return this.#label;
		}
	}
	const el = mount(register(Before)) as unknown as Before;
	assert(el instanceof Before);
	assertEquals(el.label, "before");
	(el as unknown as Element).remove();
});

Deno.test("hotSwap rebuilds live instances from the new class, private fields included", () => {
	class V1 extends BMElement {
		#text = "one";
		override get template() {
			return this.#text;
		}
	}
	class V2 extends BMElement {
		#text = "two";
		override get template() {
			return this.#text;
		}
	}
	const tag = register(V1);
	const old = mount(tag);
	assertEquals(old.textContent, "one");

	const detail = hotSwap(tag, V2 as unknown as CustomElementConstructor);

	assertEquals(detail, { tag, ok: true });
	const fresh = document.body.querySelector(tag)!;
	assertNotStrictEquals(fresh, old);
	assert(fresh instanceof V2);
	assertEquals(fresh.textContent, "two");
	assertEquals(document.createElement(tag).constructor, customElements.get(tag));
	fresh.remove();
});

Deno.test("hotSwap carries @state and @prop across and keeps attributes", () => {
	class V1 extends BMElement {
		@state()
		accessor count = this.signal(0);
		@prop()
		accessor label = this.signal("");
	}
	class V2 extends BMElement {
		@state()
		accessor count = this.signal(0);
		@prop()
		accessor label = this.signal("");
		override get template() {
			return `${this.label.get()}: ${this.count.get()}`;
		}
	}
	const tag = register(V1);
	const old = mount(tag) as unknown as V1;
	(old as unknown as Element).setAttribute("id", "keep-me");
	old.count.set(7);
	old.label.set("clicks");

	hotSwap(tag, V2 as unknown as CustomElementConstructor);

	const fresh = document.getElementById("keep-me") as unknown as V2;
	assertEquals(fresh.count.get(), 7);
	assertEquals(fresh.label.get(), "clicks");
	assertEquals((fresh as unknown as Element).textContent, "clicks: 7");
	(fresh as unknown as Element).remove();
});

Deno.test("hotSwap declines when the observed attributes change", () => {
	class V1 extends BMElement {
		@prop()
		accessor a = this.signal("");
	}
	class V2 extends BMElement {
		@prop()
		accessor b = this.signal("");
	}
	const tag = register(V1);
	const el = mount(tag);
	const events: HmrEventDetail[] = [];
	const listener = (e: Event) => events.push((e as CustomEvent<HmrEventDetail>).detail);
	globalThis.addEventListener(HMR_EVENT, listener);

	const detail = hotSwap(tag, V2 as unknown as CustomElementConstructor);

	globalThis.removeEventListener(HMR_EVENT, listener);
	assertEquals(detail.ok, false);
	assertEquals(events, [detail]);
	assertEquals(document.body.querySelector(tag), el);
	el.remove();
});

Deno.test("hotSwap declines a tag it never stood in for", () => {
	assertEquals(hotSwap("hmr-unknown", BMElement as unknown as CustomElementConstructor).ok, false);
});

Deno.test("hotSwap works without a browser, re-pointing the stand-in for later renders", () => {
	class V1 extends BMElement {
		override get template() {
			return "one";
		}
	}
	class V2 extends BMElement {
		override get template() {
			return "two";
		}
	}
	const tag = register(V1);
	assertEquals(hotSwap(tag, V2 as unknown as CustomElementConstructor).ok, true);
	const el = mount(tag);
	assert(el instanceof V2);
	assertEquals(el.textContent, "two");
	assertEquals(document.head.querySelector(`style#${tag}`), null);
	el.remove();
});
