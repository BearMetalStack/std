// The DOM here is @bearmetal/slag. The side-effect import must stay first — the
// JSX runtime picks its client or server half from `typeof document` once, at
// import time, and `BMC` captures `globalThis.HTMLElement` as its base class.
//
// Everything here goes through the real path: JSX builds the route tree,
// `BMElement` mounts the router's signal as a reactive child, and the DOM is
// read back. That is the shape the old `<bm-route>` router got wrong — it
// depended on server-rendered markup plus an activation pass, so a reload (no
// navigation, therefore no activation) left the page blank.
import "@bearmetal/slag/global";
import { assert, assertEquals } from "@std/assert";
import { setCurrentOwner } from "@bearmetal/jsx/client";
import { createRoot } from "@bearmetal/slag/testing";
import type { SlagElement } from "@bearmetal/slag";
import { navigate, resetLocationState, setUrl } from "./location.ts";

// Dynamic on purpose — see the module comment in `_app_fixture.tsx`.
const { defineApp } = await import("./_app_fixture.tsx");

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Loads the app at `pathname`, as a fresh page load would. */
async function load(pathname: string): Promise<SlagElement> {
	setCurrentOwner(null);
	resetLocationState();
	setUrl(pathname);

	const root = createRoot();
	const el = document.createElement(defineApp()) as unknown as SlagElement;
	root.appendChild(el);
	await flush();
	return el;
}

Deno.test("a router loaded at a deep URL renders that route immediately", async () => {
	// The regression, end to end: nothing navigates here — the page simply loads
	// at /settings/profile/42, exactly as it would after a refresh.
	const el = await load("/settings/profile/42");

	assert(el.querySelector(".shell"), "the layout route should have rendered");
	assertEquals(el.querySelector(".profile")?.textContent, "Profile 42");
	assertEquals(el.querySelector(".home"), null);
});

Deno.test("navigating swaps the rendered route in the live DOM", async () => {
	const el = await load("/");
	assertEquals(el.querySelector(".home")?.textContent, "Home");

	navigate("/settings/profile/7");
	await flush();
	assertEquals(el.querySelector(".home"), null);
	assertEquals(el.querySelector(".profile")?.textContent, "Profile 7");

	navigate("/");
	await flush();
	assertEquals(el.querySelector(".home")?.textContent, "Home");
	assertEquals(el.querySelector(".shell"), null);
});

Deno.test("a params-only navigation updates in place", async () => {
	const el = await load("/settings/profile/7");
	const profile = el.querySelector(".profile");

	navigate("/settings/profile/8");
	await flush();

	assertEquals(el.querySelector(".profile"), profile, "the route did not change");
	assertEquals(profile?.textContent, "Profile 8");
});

Deno.test("an unmatched URL renders the fallback", async () => {
	const el = await load("/nope");
	assertEquals(el.querySelector(".missing")?.textContent, "Not found");
});

Deno.test("links inside the router track the current route", async () => {
	const el = await load("/");
	const [home, settings] = Array.from(el.querySelectorAll("nav a"));

	assert(home.hasAttribute("data-active"));
	assert(!settings.hasAttribute("data-active"));

	navigate("/settings/profile/1");
	await flush();

	assert(!home.hasAttribute("data-active"), "the root link is exact, so it should drop out");
	assert(settings.hasAttribute("data-active"), "a section link stays active for its children");
});

Deno.test("clicking a link navigates without a reload", async () => {
	const el = await load("/");

	el.querySelector("nav a[href='/settings']")!.click();
	await flush();

	assertEquals(el.querySelector(".home"), null);
	assert(el.querySelector(".shell"), "the clicked route should be showing");
});

Deno.test("a route's custom element receives its params as props", async () => {
	// `useParams()` cannot serve a custom element: its init() runs when the
	// element enters the document, long after the route renderer returned. The
	// renderer's RouteContext is the path that works — and this is what breaks
	// every parameterised route if it doesn't.
	const el = await load("/settings/card/42");
	assertEquals(el.querySelector(".card")?.textContent, "Card 42");
});

Deno.test("a param prop stays live across a params-only navigation", async () => {
	const el = await load("/settings/card/42");
	const card = el.querySelector(".card");

	navigate("/settings/card/43");
	await flush();

	assertEquals(el.querySelector(".card"), card, "the route did not change");
	assertEquals(card?.textContent, "Card 43");
});

Deno.test("rendering a route never warns about hooks being out of scope", async () => {
	const warn = console.warn;
	const warnings: string[] = [];
	console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
	try {
		await load("/settings/card/42");
	} finally {
		console.warn = warn;
	}
	assertEquals(warnings, []);
});
