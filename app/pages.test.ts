import { installGlobals } from "@bearmetal/slag";
installGlobals();

import { assertEquals } from "@std/assert";
import { dispatch, registerPage } from "./pages.ts";

function setPageMeta(content: string | null): void {
	document.querySelector('meta[name="bm-page"]')?.remove();
	if (content === null) return;
	const meta = document.createElement("meta");
	meta.setAttribute("name", "bm-page");
	meta.setAttribute("content", content);
	document.head?.appendChild(meta) ?? document.documentElement.appendChild(meta);
}

Deno.test("dispatch calls the init registered under the embedded page key", () => {
	let called = false;
	registerPage("users/_id", () => {
		called = true;
	});
	setPageMeta("users/_id");

	dispatch();

	assertEquals(called, true);
	setPageMeta(null);
});

Deno.test("dispatch is a no-op when there is no bm-page meta tag", () => {
	let called = false;
	registerPage("main", () => {
		called = true;
	});
	setPageMeta(null);

	dispatch();

	assertEquals(called, false);
});

Deno.test("dispatch is a no-op when the embedded key has no registration", () => {
	setPageMeta("nothing/registered/for/this");

	dispatch();

	setPageMeta(null);
});
