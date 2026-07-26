// Regression coverage for the disconnect-debounce fix: a custom element's
// connectedCallback/disconnectedCallback pair can't distinguish a real removal from
// a same-document move, and reactive child slots (Switch, Show, appendReactiveChild)
// perform exactly that kind of move whenever they reinsert already-rendered content.
// Before the fix, BMElement re-ran init() (and re-armed any one-shot mount effects)
// on every such reconnect - a component whose init() writes state that influences its
// own slot would cascade into an unbounded remount loop that a node-preservation
// cache could not prevent, since the cache only dedupes construction, not reconnection.
import { assertEquals } from "@std/assert";
import { createRoot, flushMicrotasks, type TestNode } from "./_test_dom_ce.ts";
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
		make: (): TestNode => document.createElement(Probe.tag) as unknown as TestNode,
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

	// Exactly what a reactive child slot does when its wrapping effect re-fires and
	// reinserts already-rendered content: remove, then immediately reinsert.
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

	// A genuine later reconnect (teardown already settled) is a real second mount.
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

	// disconnect -> reconnect -> disconnect, all synchronous, ending disconnected.
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
