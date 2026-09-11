import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import { BMElement } from "./BMElement.ts";
import { declaredInspectable, inspect } from "./inspect.ts";

class Gadget extends BMElement {
	@inspect()
	accessor count = this.signal(0);

	accessor untracked = this.signal("nope");

	@inspect()
	accessor total = this.computed(() => this.count.get() * 2);
}

class Secretive extends BMElement {
	@inspect()
	accessor #secret = this.signal("shh");

	revealSecret(): string {
		return this.#secret.get();
	}
}

class Base extends BMElement {
	@inspect()
	accessor baseValue = this.signal("base");
}

class Sub extends Base {
	@inspect()
	accessor subValue = this.signal("sub");
}

Deno.test("declaredInspectable finds the decorated accessors", () => {
	assertEquals(declaredInspectable(Gadget).length, 2);
});

Deno.test("a plain public field's binding reflects and writes through the real signal", () => {
	const el = new Gadget();
	const binding = el.signalBindings().find((b) => b.name === "count");
	assert(binding);
	assertFalse(binding.readonly);
	assertEquals(binding.get(), 0);

	binding.set(5);
	assertEquals(el.count.get(), 5);
	assertEquals(binding.get(), 5);
});

Deno.test("an undecorated signal produces no binding", () => {
	const el = new Gadget();
	assertFalse(el.signalBindings().some((b) => b.name === "untracked"));
});

Deno.test("a true #private field surfaces a clear error instead of crashing signalBindings()", () => {
	// As of Deno 2.9.6, `context.access.get`/`.set` throw on a genuinely
	// private accessor field — an open upstream swc bug (see the comment on
	// `brokenPrivateBinding` in inspect.ts), not something userland can route
	// around. This test documents the current, degraded-but-safe behavior:
	// the binding still appears, but using it fails loudly and points at the
	// actual cause instead of crashing every other binding on the component.
	const el = new Secretive();

	const bindings = el.signalBindings();
	const binding = bindings.find((b) => b.name === "#secret");
	assert(binding, "the private field's binding should still be registered");
	assert(binding.readonly);

	assertThrows(() => binding.get(), Error, "swc-project/swc/issues/8557");
	assertThrows(() => binding.set("changed"), Error, "swc-project/swc/issues/8557");

	// The class's own method still reaches the field directly, unaffected —
	// this is purely a `context.access` problem, not a broken signal.
	assertEquals(el.revealSecret(), "shh");
});

Deno.test("a Signal.Computed binding is readonly and set() is a harmless no-op", () => {
	const el = new Gadget();
	const binding = el.signalBindings().find((b) => b.name === "total");
	assert(binding);
	assert(binding.readonly);
	assertEquals(binding.get(), 0);

	binding.set(999);
	assertEquals(binding.get(), 0, "set() must not have touched the computed");

	el.count.set(3);
	assertEquals(binding.get(), 6, "the computed still tracks its real dependency");
});

Deno.test("@inspect() fields are inherited by subclasses, without merging distinct declarations", () => {
	assertEquals(declaredInspectable(Sub).length, 2);
	assertEquals(declaredInspectable(Base).length, 1);

	const el = new Sub();
	const names = el.signalBindings().map((b) => b.name);
	assert(names.includes("baseValue"));
	assert(names.includes("subValue"));
});

Deno.test("refs are automatically included as readonly bindings", () => {
	const el = new Gadget();
	const fakeInput = {} as unknown as Element;
	el.registerRef("input", fakeInput);

	const binding = el.signalBindings().find((b) => b.name === "refs.input");
	assert(binding);
	assert(binding.readonly);
	assertEquals(binding.get(), fakeInput);
});
