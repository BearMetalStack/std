/** @jsxImportSource @bearmetal/jsx */
// Common attributes the prop types used to reject: these compile, and render
// the way each attribute's own semantics need.
import { installGlobals } from "@bearmetal/slag";
installGlobals();

import { assertEquals } from "@std/assert";

Deno.test("global attributes: autofocus is boolean, spellcheck is enumerated", () => {
	const input = (
		<input
			autofocus
			spellcheck="false"
			inputmode="numeric"
			enterkeyhint="send"
		/>
	) as HTMLInputElement;
	assertEquals(input.hasAttribute("autofocus"), true);
	assertEquals(input.getAttribute("spellcheck"), "false");
	assertEquals(input.getAttribute("inputmode"), "numeric");
	assertEquals(input.getAttribute("enterkeyhint"), "send");
});

Deno.test("input: pattern, numeric bounds and size", () => {
	const input = (
		<input
			pattern="[a-z]+"
			min={1}
			max={65535}
			step={512}
			size={4}
		/>
	) as HTMLInputElement;
	assertEquals(input.getAttribute("pattern"), "[a-z]+");
	assertEquals(input.getAttribute("min"), "1");
	assertEquals(input.getAttribute("max"), "65535");
	assertEquals(input.getAttribute("step"), "512");
	assertEquals(input.getAttribute("size"), "4");
});

Deno.test("anchor: a bare download, or a suggested name", () => {
	const bare = <a href="/backup.zip" download /> as HTMLAnchorElement;
	const named = <a href="/backup.zip" download="world.zip" /> as HTMLAnchorElement;
	assertEquals(bare.getAttribute("download"), "");
	assertEquals(named.getAttribute("download"), "world.zip");
});

Deno.test("autocomplete takes any token on every form control", () => {
	const textarea = <textarea autocomplete="street-address" /> as HTMLTextAreaElement;
	const select = <select autocomplete="country" /> as HTMLSelectElement;
	assertEquals(textarea.getAttribute("autocomplete"), "street-address");
	assertEquals(select.getAttribute("autocomplete"), "country");
});

Deno.test("shadow DOM attributes: slot, part and exportparts reach every element", () => {
	const el = <span slot="control-bold" part="toggle" exportparts="inner: outer" /> as HTMLElement;
	assertEquals(el.getAttribute("slot"), "control-bold");
	assertEquals(el.getAttribute("part"), "toggle");
	assertEquals(el.getAttribute("exportparts"), "inner: outer");
});

Deno.test('contenteditable is enumerated, so "false" is written rather than dropped', () => {
	const on = <div contenteditable="true" /> as HTMLElement;
	const off = <div contenteditable="false" /> as HTMLElement;
	const plain = <div contenteditable="plaintext-only" /> as HTMLElement;
	assertEquals(on.getAttribute("contenteditable"), "true");
	assertEquals(off.getAttribute("contenteditable"), "false");
	assertEquals(plain.getAttribute("contenteditable"), "plaintext-only");
});
