// The DOM here is @bearmetal/slag; the side-effect import must stay first.
import "@bearmetal/slag/global";
import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { createRoot, flushMicrotasks } from "@bearmetal/slag/testing";
import { BMElement } from "../BMElement.ts";
import { define } from "../define.ts";
import { createKeyedNodes } from "./Keyed.ts";
import { createScope, createSignal } from "../signals.ts";

let n = 0;
function defineProbe() {
	const counts = { init: 0, cleanup: 0 };
	@define(`bm-keyed-test-${++n}`)
	class Probe extends BMElement {
		protected init() {
			counts.init++;
			return () => {
				counts.cleanup++;
			};
		}
	}
	return { Probe, counts };
}

const later = () => new Promise((r) => setTimeout(r, 0));

Deno.test("a retained element survives a long absence and is torn down on release", async () => {
	const { Probe, counts } = defineProbe();
	const root = createRoot();
	const el = document.createElement(Probe.tag) as unknown as BMElement;
	root.appendChild(el as never);
	await flushMicrotasks();
	const release = el.retain();
	root.removeChild(el as never);
	await later();
	assertEquals(counts, { init: 1, cleanup: 0 }, "kept while retained");
	root.appendChild(el as never);
	await later();
	assertEquals(counts, { init: 1, cleanup: 0 }, "back without a second init");
	root.removeChild(el as never);
	await later();
	release();
	assertEquals(counts, { init: 1, cleanup: 1 }, "torn down when released out of the DOM");
});

Deno.test("createKeyedNodes keeps one node per key and disposes it when the key leaves", async () => {
	const { Probe, counts } = defineProbe();
	const items = createSignal([{ id: "a" }, { id: "b" }]);
	const [pool, dispose] = createScope(() =>
		createKeyedNodes(items, (i) => i.id, () => document.createElement(Probe.tag) as never)
	);
	const left = createRoot();
	const right = createRoot();
	const a = pool.get({ id: "a" });
	assertStrictEquals(pool.get({ id: "a" }), a);
	left.appendChild(a as never);
	right.appendChild(pool.get({ id: "b" }) as never);
	await flushMicrotasks();
	assertEquals(counts.init, 2);

	left.removeChild(a as never);
	await later();
	await later();
	right.appendChild(a as never);
	await later();
	assertEquals(counts, { init: 2, cleanup: 0 }, "a move with a gap kept the element");

	items.set([{ id: "b" }]);
	await later();
	assert(!pool.has("a"));
	right.removeChild(a as never);
	await later();
	assertEquals(counts.cleanup, 1, "the element whose key left is torn down");

	dispose();
	await later();
	assert(!pool.has("b"));
});
