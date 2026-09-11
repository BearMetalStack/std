// The DOM here is @bearmetal/slag; see the note in app/BMElement.test.ts.
import { installGlobals } from "@bearmetal/slag";
installGlobals();

import { assertEquals } from "@std/assert";
import { BMElement } from "@bearmetal/app";
import { walkTree } from "./walk.ts";

let nextTag = 0;

function register<T extends BMElement>(ctor: new () => T): string {
	const tag = `walk-el-${nextTag++}`;
	(ctor as unknown as typeof BMElement).tag = tag;
	customElements.define(tag, ctor as unknown as CustomElementConstructor);
	return tag;
}

class Plain extends BMElement {
	override get template() {
		return null;
	}
}
const plainTag = register(Plain);

Deno.test("finds nested components and computes their addresses", () => {
	const root = document.createElement("div");
	const outer = document.createElement(plainTag);
	const inner = document.createElement(plainTag);
	outer.appendChild(inner);
	root.appendChild(outer);

	const tree = walkTree(root);

	assertEquals([...tree.keys()], [`${plainTag}[0]`, `${plainTag}[0]>${plainTag}[0]`]);
});

Deno.test("same-tag siblings each wrapped in their own transparent element get distinct addresses", () => {
	const root = document.createElement("ul");
	const li1 = document.createElement("li");
	const li2 = document.createElement("li");
	li1.appendChild(document.createElement(plainTag));
	li2.appendChild(document.createElement(plainTag));
	root.appendChild(li1);
	root.appendChild(li2);

	const tree = walkTree(root);

	// Without the fix, both would compute as the "first" child of their own
	// (different) <li> parent and collide on the same key.
	assertEquals([...tree.keys()], [`${plainTag}[0]`, `${plainTag}[1]`]);
});

Deno.test("pierces shadow roots", () => {
	const root = document.createElement("div");
	const host = document.createElement(plainTag);
	root.appendChild(host);
	const shadow = host.attachShadow({ mode: "open" });
	const inShadow = document.createElement(plainTag);
	shadow.appendChild(inShadow);

	const tree = walkTree(root);

	assertEquals([...tree.keys()], [`${plainTag}[0]`, `${plainTag}[0]>${plainTag}[0]`]);
	assertEquals(tree.get(`${plainTag}[0]>${plainTag}[0]`)?.element, inShadow);
});

Deno.test("a hyphenated tag that isn't a BMElement is excluded, unlike isComponentElement alone", () => {
	class NotBMC extends HTMLElement {}
	customElements.define("not-a-bmc", NotBMC);

	const root = document.createElement("div");
	root.appendChild(document.createElement("not-a-bmc"));

	const tree = walkTree(root);

	assertEquals(tree.size, 0);
});

Deno.test("skip excludes the given element and its subtree", () => {
	const root = document.createElement("div");
	const skipped = document.createElement(plainTag);
	skipped.appendChild(document.createElement(plainTag));
	const survivor = document.createElement(plainTag);
	root.appendChild(skipped);
	root.appendChild(survivor);

	const tree = walkTree(root, { skip: skipped });

	assertEquals(tree.size, 1);
	const [[, node]] = tree;
	assertEquals(node.element, survivor);
});
