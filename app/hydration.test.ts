// The DOM here is @bearmetal/slag; see the note in BMElement.test.ts.
import { installGlobals } from "@bearmetal/slag";
installGlobals();

import { assert, assertEquals } from "@std/assert";
import { BMElement, STATE_ATTRIBUTE } from "./BMElement.ts";
import { resetHydration } from "./hydration.ts";
import { state } from "./state.ts";

let nextTag = 0;

function register<T extends BMElement>(ctor: new () => T): string {
	const tag = `hy-el-${nextTag++}`;
	(ctor as unknown as typeof BMElement).tag = tag;
	customElements.define(tag, ctor as unknown as CustomElementConstructor);
	return tag;
}

/** A component that carries one piece of server state and renders it. */
function stateful() {
	return class extends BMElement {
		@state()
		accessor payload = this.signal("");

		override get template() {
			return null;
		}
	};
}

function el(tag: string, state?: unknown): Element {
	const node = document.createElement(tag) as unknown as Element;
	if (state !== undefined) node.setAttribute(STATE_ATTRIBUTE, JSON.stringify(state));
	return node;
}

type Stateful = BMElement & { payload: { get(): string } };

function reset() {
	resetHydration();
	(document.body as unknown as Element).replaceChildren();
}

Deno.test("a rebuilt element picks up the state its discarded original held", () => {
	reset();
	const Leaf = stateful();
	const leafTag = register(Leaf);

	// The server's markup: a component carrying state, inside a parent that will
	// re-render and throw it away.
	class Parent extends BMElement {
		override get template() {
			return el(leafTag); // rebuilt, with no attribute of its own
		}
	}
	const parentTag = register(Parent);

	const parent = el(parentTag);
	parent.appendChild(el(leafTag, { payload: "from the server" }));
	(document.body as unknown as Element).appendChild(parent as unknown as Node);

	const leaf = parent.querySelector(leafTag) as unknown as Stateful;
	assertEquals(leaf.payload.get(), "from the server");
	assert(
		!(leaf as unknown as Element).hasAttribute(STATE_ATTRIBUTE),
		"the claimed snapshot should be consumed",
	);
});

Deno.test("state survives two levels of rebuilding", () => {
	// The case that made this worth fixing: the grandchild is discarded twice
	// over, once with its parent's subtree and once when the parent itself
	// re-renders, and neither replacement has an attribute to read.
	reset();
	const Leaf = stateful();
	const leafTag = register(Leaf);

	class Middle extends BMElement {
		override get template() {
			return el(leafTag);
		}
	}
	const middleTag = register(Middle);

	class Outer extends BMElement {
		override get template() {
			return el(middleTag);
		}
	}
	const outerTag = register(Outer);

	const outer = el(outerTag);
	const middle = el(middleTag);
	middle.appendChild(el(leafTag, { payload: "two deep" }));
	outer.appendChild(middle);
	(document.body as unknown as Element).appendChild(outer as unknown as Node);

	const leaf = outer.querySelector(leafTag) as unknown as Stateful;
	assertEquals(leaf.payload.get(), "two deep");
});

Deno.test("siblings at one path keep their own state, in order", () => {
	reset();
	const Leaf = stateful();
	const leafTag = register(Leaf);

	class Parent extends BMElement {
		override get template() {
			const frag = document.createDocumentFragment();
			frag.appendChild(el(leafTag) as unknown as Node);
			frag.appendChild(el(leafTag) as unknown as Node);
			return frag as unknown as Element;
		}
	}
	const parentTag = register(Parent);

	const parent = el(parentTag);
	parent.appendChild(el(leafTag, { payload: "first" }));
	parent.appendChild(el(leafTag, { payload: "second" }));
	(document.body as unknown as Element).appendChild(parent as unknown as Node);

	const leaves = [...parent.querySelectorAll(leafTag)] as unknown as Stateful[];
	assertEquals(leaves.map((l) => l.payload.get()), ["first", "second"]);
});

Deno.test("a component in a different structural position claims nothing", () => {
	// The guard that makes a queue safe: paths are the chain of custom element
	// tags, so a leaf under one parent can never be handed a leaf-under-another
	// parent's state just because it happened to be built first.
	reset();
	const Leaf = stateful();
	const leafTag = register(Leaf);

	class Elsewhere extends BMElement {
		override get template() {
			return el(leafTag);
		}
	}
	const elsewhereTag = register(Elsewhere);

	class Holder extends BMElement {
		override get template() {
			return null;
		}
	}
	const holderTag = register(Holder);

	// The server rendered the leaf under `holder`; the client builds one under
	// `elsewhere`. Different path, so no claim.
	const holder = el(holderTag);
	holder.appendChild(el(leafTag, { payload: "not yours" }));
	(document.body as unknown as Element).appendChild(holder as unknown as Node);

	const elsewhere = el(elsewhereTag);
	(document.body as unknown as Element).appendChild(elsewhere as unknown as Node);

	const leaf = elsewhere.querySelector(leafTag) as unknown as Stateful;
	assertEquals(leaf.payload.get(), "");
});

Deno.test("an element with its own attribute does not consume a sibling's", () => {
	reset();
	const Leaf = stateful();
	const leafTag = register(Leaf);

	class Parent extends BMElement {
		override get template() {
			return null; // never rebuilds, so the originals stay
		}
	}
	const parentTag = register(Parent);

	const parent = el(parentTag);
	parent.appendChild(el(leafTag, { payload: "mine" }));
	parent.appendChild(el(leafTag, { payload: "also mine" }));
	(document.body as unknown as Element).appendChild(parent as unknown as Node);

	const leaves = [...parent.querySelectorAll(leafTag)] as unknown as Stateful[];
	assertEquals(leaves.map((l) => l.payload.get()), ["mine", "also mine"]);
});

Deno.test("nothing is claimed once the boot phase is over", async () => {
	reset();
	const Leaf = stateful();
	const leafTag = register(Leaf);

	class Parent extends BMElement {
		override get template() {
			return null;
		}
	}
	const parentTag = register(Parent);

	const parent = el(parentTag);
	parent.appendChild(el(leafTag, { payload: "boot only" }));
	(document.body as unknown as Element).appendChild(parent as unknown as Node);

	// Opens and then closes the window.
	await new Promise((resolve) => setTimeout(resolve, 5));

	// A component built later is a new component, not a rebuilt one, and must
	// not be handed a snapshot that belongs to the page as it was sent.
	const late = el(leafTag);
	parent.appendChild(late as unknown as Node);
	assertEquals((late as unknown as Stateful).payload.get(), "");
});
