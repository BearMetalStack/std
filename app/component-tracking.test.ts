// The DOM here is @bearmetal/slag; the side-effect import must stay first, so
// the jsx runtime picks its client half.
import "@bearmetal/slag/global";
import { assertEquals } from "@std/assert";
import { jsx } from "@bearmetal/jsx/jsx-runtime";
import { createComputed, createSignal, effect } from "./signals.ts";

Deno.test("a signal read by a function component is not a dependency of the render calling it", async () => {
	const inner = createSignal(0);
	let outerRuns = 0;
	function Child(): Element {
		inner.get();
		return document.createElement("span") as unknown as Element;
	}
	const view = createComputed(() => {
		outerRuns++;
		return jsx(Child, {});
	});
	const stop = effect(() => {
		view.get();
	});

	inner.set(1);
	await new Promise((r) => setTimeout(r, 0));
	stop();

	assertEquals(outerRuns, 1);
});
