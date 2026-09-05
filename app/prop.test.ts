import { assert, assertEquals, assertFalse } from "@std/assert";
import { Signal } from "@signals";
import { BMElement } from "./BMElement.ts";
import { prop } from "./prop.ts";

class Counter extends BMElement {
	@prop()
	accessor count = this.signal(0);
	@prop()
	accessor label = this.signal("Count");
	@prop()
	accessor open = this.signal(false);
}

Deno.test("declared props become observedAttributes, before any instance exists", () => {
	assertEquals(Counter.observedAttributes.toSorted(), ["count", "label", "open"]);
});

Deno.test("a prop's accessor is the signal itself", () => {
	const el = new Counter();

	assert(el.count instanceof Signal.State);
	assertEquals(el.count.get(), 0);
	assertEquals(el.label.get(), "Count");
});

Deno.test("the accessor reads and writes through .get()/.set()", () => {
	const el = new Counter();

	el.count.set(7);
	assertEquals(el.count.get(), 7);
});

Deno.test("attributeChangedCallback coerces back to the declared type", () => {
	const el = new Counter();

	el.attributeChangedCallback("count", null, "42");
	assertEquals(el.count.get(), 42);
	assert(typeof el.count.get() === "number");

	el.attributeChangedCallback("label", null, "Total");
	assertEquals(el.label.get(), "Total");

	el.attributeChangedCallback("open", null, "");
	assertEquals(el.open.get(), true);
	el.attributeChangedCallback("open", "", null);
	assertEquals(el.open.get(), false);
});

Deno.test("an attribute update propagates to an effect reading the prop", () => {
	const el = new Counter();
	const seen: number[] = [];

	const stop = new Signal.subtle.Watcher(() => {});
	const computed = new Signal.Computed(() => el.count.get());
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
	assertEquals((el as unknown as Record<string, unknown>).nonsense, undefined);
});

Deno.test("props are inherited by subclasses", () => {
	class Extended extends Counter {
		@prop()
		accessor extra = this.signal("");
	}

	assertEquals(Extended.observedAttributes.toSorted(), ["count", "extra", "label", "open"]);
	// The base class is unaffected by the subclass's declaration.
	assertEquals(Counter.observedAttributes.toSorted(), ["count", "label", "open"]);
});

Deno.test("each instance gets its own signal", () => {
	const a = new Counter();
	const b = new Counter();

	a.count.set(5);
	assertEquals(a.count.get(), 5);
	assertEquals(b.count.get(), 0);
});

Deno.test("a component's first-ever construction, nested inside an ambient computation, does not wire its prop signal as that computation's dependency", () => {
	// `declared[name] ??= inferType(value.get())` only actually calls `.get()`
	// the first time any instance of a given class is constructed — later
	// instances find `declared[name]` already resolved and short-circuit past
	// it. So this class must be fresh: it stands in for a component being
	// constructed for the very first time, nested inside some ancestor's
	// render computation. `jsx()` already untracks this for JSX-driven
	// construction (see `jsx/lib/jsx.ts`'s `isBMC` branch) — this test
	// exercises the call site directly, since a `template` can also construct
	// a child via plain `document.createElement`, bypassing `jsx()` entirely.
	class FreshOnFirstConstruction extends BMElement {
		@prop()
		accessor greeting = this.signal<string | null>(null);
	}

	let instance: FreshOnFirstConstruction | undefined;

	const watcher = new Signal.subtle.Watcher(() => {});
	const ambient = new Signal.Computed(() => {
		instance = new FreshOnFirstConstruction();
		return {};
	});
	watcher.watch(ambient);
	ambient.get();

	assert(instance !== undefined);
	assertFalse(
		Signal.subtle.introspectSinks(instance!.greeting).includes(ambient),
		"the ambient computation must not become a live consumer of the freshly constructed prop signal",
	);

	watcher.unwatch(ambient);
});

Deno.test("an explicit type is used when the signal's initial value can't infer one", () => {
	class WithUndefined extends BMElement {
		@prop(Number)
		accessor maybe = this.signal<number | undefined>(undefined);
	}

	assertEquals(WithUndefined.observedAttributes.toSorted(), ["maybe"]);
	const el = new WithUndefined();
	el.attributeChangedCallback("maybe", null, "9");
	assertEquals(el.maybe.get(), 9);
});
