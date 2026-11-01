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

Deno.test("@element registers a plain HTMLElement under every tag it is stacked with", async () => {
	await import("@bearmetal/slag/global");
	const { element } = await import("./define.ts");

	@element("element-test-panel")
	@element("element-test-card")
	class Surface extends HTMLElement {
		hello() {
			return "hi";
		}
	}

	const panel = customElements.get("element-test-panel");
	const card = customElements.get("element-test-card");
	assertEquals(typeof panel, "function");
	assertEquals(typeof card, "function");
	assertEquals(panel === card, false);
	const el = document.createElement("element-test-card") as Surface;
	assertEquals(el.hello(), "hi");
	assertEquals((Surface as unknown as { tag: string }).tag, "element-test-panel");
});
