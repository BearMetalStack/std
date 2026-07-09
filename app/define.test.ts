import { assertEquals, assertThrows } from "@std/assert";
import { normalizeComponentName } from "./define.ts";

Deno.test("normalizeComponentName leaves valid tags untouched", () => {
	for (const tag of ["app-joke", "my-component", "counter-app", "item-card"]) {
		assertEquals(normalizeComponentName(tag), tag);
	}
});

Deno.test("normalizeComponentName hyphenates words and punctuation", () => {
	assertEquals(normalizeComponentName("My Component"), "my-component");
	assertEquals(normalizeComponentName("My *very cool* Component"), "my-very-cool-component");
	assertEquals(normalizeComponentName("MyComponent"), "my-component");
	assertEquals(normalizeComponentName("my_component"), "my-component");
});

Deno.test("normalizeComponentName prefixes names without a hyphen", () => {
	assertEquals(normalizeComponentName("component"), "my-component");
	assertEquals(normalizeComponentName("Component"), "my-component");
});

Deno.test("normalizeComponentName is idempotent", () => {
	for (const tag of ["My Component", "component", "MyComponent", "My *very cool* Component"]) {
		const once = normalizeComponentName(tag);
		assertEquals(normalizeComponentName(once), once);
	}
});

Deno.test("normalizeComponentName rejects names with nothing to build a tag from", () => {
	assertThrows(() => normalizeComponentName("***"), Error, "alphanumeric");
});
