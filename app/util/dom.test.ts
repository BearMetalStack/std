import { assert, assertFalse } from "@std/assert";
import { isComponentElement } from "./dom.ts";

Deno.test("isComponentElement is true for a hyphenated tag name", () => {
	assert(isComponentElement({ localName: "user-card" } as Element));
});

Deno.test("isComponentElement is false for a plain tag name", () => {
	assertFalse(isComponentElement({ localName: "div" } as Element));
});
