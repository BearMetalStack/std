// Regression coverage for the disconnect-debounce fix: a custom element's
// connectedCallback/disconnectedCallback pair can't distinguish a real removal from
// a same-document move, and reactive child slots (Switch, Show, appendReactiveChild)
// perform exactly that kind of move whenever they reinsert already-rendered content.
// Before the fix, BMElement re-ran init() (and re-armed any one-shot mount effects)
// on every such reconnect - a component whose init() writes state that influences its
// own slot would cascade into an unbounded remount loop that a node-preservation
// cache could not prevent, since the cache only dedupes construction, not reconnection.
//
// The DOM here is @bearmetal/slag. The side-effect import must stay first: `BMC`
// captures `globalThis.HTMLElement` as its base class when `@bearmetal/jsx` is
// evaluated, and the jsx runtime picks its client/server half from `typeof
// document` at the same moment - both of which happen on the `./BMElement.ts`
// import below.
import "@bearmetal/slag/global";
import { assertEquals } from "@std/assert";
import { createRoot, flushMicrotasks } from "@bearmetal/slag/testing";
import type { SlagElement } from "@bearmetal/slag";
import { BMElement } from "./BMElement.ts";
import { define } from "./define.ts";

let tagCounter = 0;
function freshTag(): string {
	return `bm-reconnect-test-${++tagCounter}`;
}

function defineProbe() {
	let initCount = 0;
	let cleanupCount = 0;

	@define(freshTag())
	class Probe extends BMElement {
		protected init(): void | (() => void) {
			initCount++;
			return () => {
				cleanupCount++;
			};
		}
		protected get template() {
			return undefined;
		}
	}

	return {
		make: (): SlagElement => document.createElement(Probe.tag) as unknown as SlagElement,
		counts: () => ({ initCount, cleanupCount }),
	};
}

Deno.test("reconnecting the same instance in the same tick does not re-run init()", async () => {
	const { make, counts } = defineProbe();
	const root = createRoot();
	const el = make();

	root.appendChild(el);
	await flushMicrotasks();
	assertEquals(counts(), { initCount: 1, cleanupCount: 0 }, "first connect runs init once");

	root.removeChild(el);
	root.appendChild(el);
	await flushMicrotasks();

	assertEquals(
		counts(),
		{ initCount: 1, cleanupCount: 0 },
		"same-tick reconnect must not re-run init or clean up - the component never really left",
	);
});

Deno.test("a real disconnect (no reconnect) still tears down", async () => {
	const { make, counts } = defineProbe();
	const root = createRoot();
	const el = make();

	root.appendChild(el);
	await flushMicrotasks();
	assertEquals(counts(), { initCount: 1, cleanupCount: 0 });

	root.removeChild(el);
	await flushMicrotasks();

	assertEquals(
		counts(),
		{ initCount: 1, cleanupCount: 1 },
		"a disconnect with no follow-up reconnect must still clean up",
	);
});

Deno.test("reconnecting after teardown has already run starts a fresh lifecycle", async () => {
	const { make, counts } = defineProbe();
	const root = createRoot();
	const el = make();

	root.appendChild(el);
	await flushMicrotasks();

	root.removeChild(el);
	await flushMicrotasks();
	assertEquals(counts(), { initCount: 1, cleanupCount: 1 }, "teardown ran");

	root.appendChild(el);
	await flushMicrotasks();

	assertEquals(
		counts(),
		{ initCount: 2, cleanupCount: 1 },
		"reconnecting after settled teardown re-runs init",
	);
});

Deno.test("rapid disconnect/reconnect flip-flops within one tick settle on the final state", async () => {
	const { make, counts } = defineProbe();
	const root = createRoot();
	const el = make();

	root.appendChild(el);
	await flushMicrotasks();

	root.removeChild(el);
	root.appendChild(el);
	root.removeChild(el);
	await flushMicrotasks();

	assertEquals(
		counts(),
		{ initCount: 1, cleanupCount: 1 },
		"final state is disconnected, so exactly one teardown must run - no double cleanup",
	);
});

Deno.test("a same-document move keeps the instance mounted", async () => {
	// The move case the old shim modelled but this file could not previously
	// exercise directly: no explicit remove, just a reparent.
	const { make, counts } = defineProbe();
	const from = createRoot();
	const to = createRoot();
	const el = make();

	from.appendChild(el);
	await flushMicrotasks();
	assertEquals(counts(), { initCount: 1, cleanupCount: 0 });

	to.appendChild(el);
	await flushMicrotasks();

	assertEquals(
		counts(),
		{ initCount: 1, cleanupCount: 0 },
		"reparenting is a disconnect/connect pair the debounce must absorb",
	);
});
