// The server half of the component lifecycle: `serverInit()`, `@state`, and the
// hydration handoff. One runtime and one template throughout — what is being
// tested here is the *timing*, not a second rendering path.
import { installGlobals } from "@bearmetal/slag";
installGlobals();

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { STATE_ATTRIBUTE } from "../BMElement.ts";
import { renderToString } from "./render.ts";

const fixture = await import("./_render_fixture.tsx");

Deno.test("a component with no serverInit renders its template as it would anywhere", async () => {
	assertEquals(await renderToString(fixture.Plain), "<plain-thing><em>plain</em></plain-thing>");
});

Deno.test("serverInit's result reaches the markup", async () => {
	fixture.resetLog();
	const html = await renderToString(fixture.Greeting);

	assertStringIncludes(html, "<p>hello, you</p>");
});

Deno.test("init() does not run during a server render", async () => {
	fixture.resetLog();
	await renderToString(fixture.Greeting);

	assert(
		!fixture.log.includes("init"),
		"init() is the browser half of the lifecycle: no listeners, timers or " +
			"subscriptions should start for a page that is about to become a string",
	);
});

Deno.test("@state is written into the markup for the browser to pick up", async () => {
	const html = await renderToString(fixture.Greeting);

	assertStringIncludes(html, `${STATE_ATTRIBUTE}="{&quot;greeting&quot;:&quot;hello, you&quot;}"`);
});

Deno.test("hydration reads @state back into the signal, and clears the attribute", () => {
	// What a browser does when the server-rendered element upgrades. No render
	// scope is open, so this takes the client path.
	const el = document.createElement("load-greeting") as unknown as {
		setAttribute(name: string, value: string): void;
		hasAttribute(name: string): boolean;
		connectedCallback(): void;
		greeting: { get(): string };
		innerHTML: string;
	};
	el.setAttribute(STATE_ATTRIBUTE, JSON.stringify({ greeting: "from the server" }));
	el.connectedCallback();

	assertEquals(el.greeting.get(), "from the server", "the signal itself is hydrated");
	assertEquals(
		el.hasAttribute(STATE_ATTRIBUTE),
		false,
		"the payload is consumed, not left in the DOM",
	);
	assertStringIncludes(el.innerHTML, "from the server");
});

Deno.test("sibling serverInits overlap rather than running in tree order", async () => {
	fixture.resetLog();
	await renderToString(fixture.Two);

	// Both start before either finishes. Awaiting each component as it rendered
	// would give start/end/start/end, and a page of ten components would take ten
	// round trips instead of one.
	assertEquals(fixture.log.slice(0, 2), [
		"serverInit:start:a",
		"serverInit:start:b",
	]);
});

Deno.test("a component revealed by another component's serverInit gets its own turn", async () => {
	const html = await renderToString(fixture.Nested);

	assertStringIncludes(
		html,
		"<p>hello, nested</p>",
		"the settle loop runs again for work the previous pass produced",
	);
});

Deno.test("a client-only component renders its tag and nothing else", async () => {
	const html = await renderToString(fixture.ClientOnly);

	assertEquals(html, '<client-only-widget data-x="1"></client-only-widget>');
});

Deno.test("an async child is awaited before the markup is handed back", async () => {
	assertEquals(await renderToString(fixture.AsyncChild), "<section><b>late</b></section>");
});

Deno.test("renders are independent when several are in flight", async () => {
	// Two renders overlapping is the normal case for a server, and the thing that
	// would break first is the URL: it is scoped to a synchronous render, and
	// nothing may interleave with one.
	const [a, b] = await Promise.all([
		renderToString(fixture.Greeting, { url: "/a" }),
		renderToString(fixture.Greeting, { url: "/b" }),
	]);

	assertStringIncludes(a, "<p>hello, you</p>");
	assertStringIncludes(b, "<p>hello, you</p>");
});
