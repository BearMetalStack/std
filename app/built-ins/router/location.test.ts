// The DOM here is @bearmetal/slag. The side-effect import must stay first —
// `location.ts` decides whether it is client-side from `typeof document`.
import "@bearmetal/slag/global";
// Installs the effect implementation the JSX runtime uses for reactive props.
// Real consumers get this from importing `@bearmetal/app`; a test that reaches
// straight for a built-in has to ask for it.
import "../../BMElement.ts";
import { assert, assertEquals } from "@std/assert";
import {
	interceptLinkClicks,
	navigate,
	resetLocationState,
	setUrl,
	urlSignal,
} from "./location.ts";
import { Link } from "./Link.tsx";

function anchor(attrs: Record<string, string>): Element {
	const el = document.createElement("a");
	for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
	document.body.appendChild(el);
	return el as unknown as Element;
}

/**
 * Dispatches a click that looks like the plain left click a user makes.
 *
 * Two accommodations for the test environment, neither of which production code
 * needs:
 *
 * - Deno has no `MouseEvent`, and the modifier/button fields the interceptor
 *   reads are exactly what decide whether a click is "plain", so they are
 *   defined onto a real `Event` rather than faked with a bare object.
 * - Deno's `EventTarget` skips the whole propagation path when the dispatch
 *   target has no listeners of its own, so a bubbling-only listener (which is
 *   what the interceptor is) never sees the event. A no-op listener on the
 *   target restores real-browser propagation.
 */
function click(el: Element, overrides: Record<string, unknown> = {}): Event {
	const event = new Event("click", { bubbles: true, cancelable: true });
	const fields = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
	for (const [key, value] of Object.entries({ ...fields, ...overrides })) {
		Object.defineProperty(event, key, { value, configurable: true });
	}
	const noop = () => {};
	el.addEventListener("click", noop);
	try {
		el.dispatchEvent(event);
	} finally {
		el.removeEventListener("click", noop);
	}
	return event;
}

function pathname(): string {
	return new URL(urlSignal().get()).pathname;
}

Deno.test("navigate updates the URL signal without a history to push to", () => {
	resetLocationState();
	setUrl("/");
	navigate("/about");
	assertEquals(pathname(), "/about");
});

Deno.test("navigate resolves a relative target against the current URL", () => {
	resetLocationState();
	setUrl("/docs/intro");
	navigate("?page=2");
	assertEquals(new URL(urlSignal().get()).search, "?page=2");
	assertEquals(pathname(), "/docs/intro");
});

Deno.test("the URL signal only notifies when the URL actually changes", () => {
	resetLocationState();
	setUrl("/a");
	const url = urlSignal();
	const before = url.get();
	setUrl("/a");
	assertEquals(url.get(), before);
});

Deno.test("a plain left click on a same-origin link is intercepted", () => {
	resetLocationState();
	setUrl("/");
	const release = interceptLinkClicks();
	try {
		const event = click(anchor({ href: "/about" }));
		assert(event.defaultPrevented);
		assertEquals(pathname(), "/about");
	} finally {
		release();
	}
});

Deno.test("a click on a child of a link is intercepted", () => {
	resetLocationState();
	setUrl("/");
	const release = interceptLinkClicks();
	try {
		const link = anchor({ href: "/about" });
		const span = document.createElement("span");
		link.appendChild(span as unknown as Node);
		click(span as unknown as Element);
		assertEquals(pathname(), "/about");
	} finally {
		release();
	}
});

Deno.test("clicks the browser would not treat as a plain navigation are left alone", async (t) => {
	const cases: Array<[string, Record<string, string>, Record<string, unknown>]> = [
		["a modified click", { href: "/about" }, { metaKey: true }],
		["a middle click", { href: "/about" }, { button: 1 }],
		["a download link", { href: "/about", download: "" }, {}],
		["an external link", { href: "/about", rel: "noopener external" }, {}],
		["a link with a target", { href: "/about", target: "_blank" }, {}],
		["a cross-origin link", { href: "https://example.com/about" }, {}],
		["a same-page hash jump", { href: "#section" }, {}],
	];

	for (const [name, attrs, event] of cases) {
		await t.step(name, () => {
			resetLocationState();
			setUrl("/");
			const release = interceptLinkClicks();
			try {
				assert(!click(anchor(attrs), event).defaultPrevented);
				assertEquals(pathname(), "/");
			} finally {
				release();
			}
		});
	}
});

Deno.test("the interceptor is reference counted", () => {
	resetLocationState();
	setUrl("/");
	const first = interceptLinkClicks();
	const second = interceptLinkClicks();

	first();
	click(anchor({ href: "/about" }));
	assertEquals(pathname(), "/about", "one release should not tear down a listener still in use");

	second();
	setUrl("/");
	click(anchor({ href: "/elsewhere" }));
	assertEquals(pathname(), "/");
});

Deno.test("Link renders a real href and navigates on click", () => {
	resetLocationState();
	setUrl("/");
	const el = Link({ href: "/about", children: "About" }) as unknown as Element;
	document.body.appendChild(el as unknown as Node);

	assertEquals(el.getAttribute("href"), "/about");
	assertEquals(el.textContent, "About");

	click(el);
	assertEquals(pathname(), "/about");
});

Deno.test("Link marks itself active for the current location and its section", () => {
	resetLocationState();
	setUrl("/settings/profile");
	const section = Link({ href: "/settings", children: "Settings" }) as unknown as Element;
	const exact = Link({
		href: "/settings",
		exact: true,
		children: "Settings",
	}) as unknown as Element;
	const other = Link({ href: "/help", children: "Help" }) as unknown as Element;

	assert(section.hasAttribute("data-active"));
	assertEquals(section.getAttribute("aria-current"), "page");
	assert(!exact.hasAttribute("data-active"));
	assert(!other.hasAttribute("data-active"));
});

Deno.test("Link drops its active marking when navigation moves away", async () => {
	resetLocationState();
	setUrl("/about");
	const el = Link({ href: "/about", children: "About" }) as unknown as Element;
	assert(el.hasAttribute("data-active"));

	navigate("/");
	await new Promise((r) => setTimeout(r, 0));

	assert(!el.hasAttribute("data-active"), "data-active should be removed, not left behind");
	assert(!el.hasAttribute("aria-current"));
});

Deno.test("Link leaves a cross-origin href alone", () => {
	resetLocationState();
	setUrl("/");
	const el = Link({ href: "https://example.com/docs", children: "Docs" }) as unknown as Element;
	assertEquals(el.getAttribute("href"), "https://example.com/docs");
	assert(!el.hasAttribute("data-active"));

	document.body.appendChild(el as unknown as Node);
	assert(!click(el).defaultPrevented);
	assertEquals(pathname(), "/");
});
