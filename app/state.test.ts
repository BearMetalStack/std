// The DOM here is @bearmetal/slag; see the note in BMElement.test.ts.
import { installGlobals } from "@bearmetal/slag";
installGlobals();

import { assert, assertEquals } from "@std/assert";
import { BMElement, STATE_ATTRIBUTE } from "./BMElement.ts";
import { declaredState, state } from "./state.ts";

let nextTag = 0;

function register<T extends BMElement>(ctor: new () => T): string {
	const tag = `state-el-${nextTag++}`;
	(ctor as unknown as typeof BMElement).tag = tag;
	customElements.define(tag, ctor as unknown as CustomElementConstructor);
	return tag;
}

class Card extends BMElement {
	@state()
	accessor heading = this.signal("");

	@state()
	accessor rows = this.signal<number[]>([]);

	accessor untracked = this.signal("not state");

	override get template() {
		return null;
	}
}

const cardTag = register(Card);

Deno.test("declaredState finds the decorated accessors", () => {
	assertEquals(declaredState(Card).sort(), ["heading", "rows"]);
});

Deno.test("serializeState writes every @state signal into the markup", () => {
	const el = document.createElement(cardTag) as unknown as Card;
	document.body.appendChild(el as unknown as Node);
	el.heading.set("Ada");
	el.rows.set([1, 2]);
	el.serializeState();

	assertEquals(
		JSON.parse((el as unknown as Element).getAttribute(STATE_ATTRIBUTE)!),
		{ heading: "Ada", rows: [1, 2] },
	);
	(el as unknown as Element).remove();
});

Deno.test("an undecorated signal stays out of the snapshot", () => {
	const el = document.createElement(cardTag) as unknown as Card;
	document.body.appendChild(el as unknown as Node);
	el.serializeState();
	const snapshot = JSON.parse((el as unknown as Element).getAttribute(STATE_ATTRIBUTE)!);
	assert(!("untracked" in snapshot));
	(el as unknown as Element).remove();
});

Deno.test("a connecting element reads its state back out of the markup", () => {
	// The client half of the round trip: this is what has to happen before the
	// first browser render, or the component starts from its empty values and
	// renders the "still loading" branch over markup that already had the answer.
	const el = document.createElement(cardTag) as unknown as Card;
	(el as unknown as Element).setAttribute(
		STATE_ATTRIBUTE,
		JSON.stringify({ heading: "Ada", rows: [3] }),
	);

	document.body.appendChild(el as unknown as Node);

	assertEquals(el.heading.get(), "Ada");
	assertEquals(el.rows.get(), [3]);
	assert(
		!(el as unknown as Element).hasAttribute(STATE_ATTRIBUTE),
		"the attribute should be consumed once it has been read",
	);
	(el as unknown as Element).remove();
});
