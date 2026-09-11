// The DOM here is @bearmetal/slag; see the note in app/BMElement.test.ts.
import { installGlobals } from "@bearmetal/slag";
installGlobals();

import { assert, assertEquals } from "@std/assert";
import { formatValue, parseEdit, safeFormat, toBindable } from "./format.ts";

Deno.test("formatValue handles the primitives devtools actually sees", () => {
	assertEquals(formatValue(undefined), "undefined");
	assertEquals(formatValue(null), "null");
	assertEquals(formatValue("hi"), "hi");
	assertEquals(formatValue(42), "42");
	assertEquals(formatValue([1, 2]), "[1,2]");
});

Deno.test("formatValue special-cases Element, since refs.<name> bindings return one", () => {
	const el = document.createElement("input");
	assertEquals(formatValue(el), "<input>");
});

Deno.test("formatValue renders a function by name", () => {
	function greet() {}
	assertEquals(formatValue(greet), "ƒ greet");
});

Deno.test("parseEdit round-trips JSON, and falls back to raw text", () => {
	assertEquals(parseEdit("42"), 42);
	assertEquals(parseEdit("true"), true);
	assertEquals(parseEdit('"quoted"'), "quoted");
	assertEquals(parseEdit("plain text"), "plain text");
});

Deno.test("safeFormat surfaces a throwing get() as an inline error, not an exception", () => {
	const broken = {
		get(): never {
			throw new Error("boom");
		},
	};
	assertEquals(safeFormat(broken), "⚠ boom");
});

Deno.test("toBindable reads through safeFormat and writes through parseEdit", () => {
	let stored = 5;
	const binding = {
		get: () => stored,
		set: (v: unknown) => {
			stored = v as number;
		},
	};

	const bindable = toBindable(binding);
	assertEquals(bindable.get(), "5");

	bindable.set("9");
	assertEquals(stored, 9);
});

Deno.test("toBindable's get() never throws, even when the underlying binding does", () => {
	const bindable = toBindable({
		get(): never {
			throw new Error("boom");
		},
		set: () => {},
	});
	assert(bindable.get().startsWith("⚠"));
});
