import { assert, assertEquals } from "@std/assert";
import { Signal } from "@signals";
import { BMElement } from "./BMElement.ts";
import { prop } from "./prop.ts";

class Counter extends BMElement {
	@prop()
	accessor count = 0;
	@prop()
	accessor label = "Count";
	@prop()
	accessor open = false;
}

Deno.test("declared props become observedAttributes, before any instance exists", () => {
	assertEquals(Counter.observedAttributes.sort(), ["count", "label", "open"]);
});

Deno.test("a prop is backed by a signal in this.signals", () => {
	const el = new Counter();

	assert(el.signals.$count instanceof Signal.State);
	assertEquals(el.signals.$count.get(), 0);
	assertEquals(el.signals.$label.get(), "Count");
});

Deno.test("the accessor reads and writes through the signal", () => {
	const el = new Counter();

	el.count = 7;
	assertEquals(el.signals.$count.get(), 7);

	el.signals.$count.set(9);
	assertEquals(el.count, 9);
});

Deno.test("attributeChangedCallback coerces back to the declared type", () => {
	const el = new Counter();

	el.attributeChangedCallback("count", null, "42");
	assertEquals(el.count, 42);
	assert(typeof el.count === "number");

	el.attributeChangedCallback("label", null, "Total");
	assertEquals(el.label, "Total");

	// An attribute is present or absent; `open=""` is true, removal is false.
	el.attributeChangedCallback("open", null, "");
	assertEquals(el.open, true);
	el.attributeChangedCallback("open", "", null);
	assertEquals(el.open, false);
});

Deno.test("an attribute update propagates to an effect reading the prop", () => {
	const el = new Counter();
	const seen: number[] = [];

	const stop = new Signal.subtle.Watcher(() => {});
	const computed = new Signal.Computed(() => el.signals.$count.get() as number);
	stop.watch(computed);
	seen.push(computed.get());

	el.attributeChangedCallback("count", null, "3");
	seen.push(computed.get());

	assertEquals(seen, [0, 3]);
	stop.unwatch(computed);
});

Deno.test("undeclared attributes are ignored", () => {
	const el = new Counter();
	el.attributeChangedCallback("nonsense", null, "x");
	assertEquals(el.signals.$nonsense, undefined);
});

Deno.test("props are inherited by subclasses", () => {
	class Extended extends Counter {
		@prop()
		accessor extra = "";
	}

	assertEquals(Extended.observedAttributes.sort(), ["count", "extra", "label", "open"]);
	// The base class is unaffected by the subclass's declaration.
	assertEquals(Counter.observedAttributes.sort(), ["count", "label", "open"]);
});

Deno.test("each instance gets its own signal", () => {
	const a = new Counter();
	const b = new Counter();

	a.count = 5;
	assertEquals(a.count, 5);
	assertEquals(b.count, 0);
});
