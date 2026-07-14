import { assert, assertEquals } from "@std/assert";
import { DebouncedSignal, IntervalSignal } from "./bmsignals.ts";
import { Signal } from "./signals/wrapper.ts";

Deno.test("DebouncedSignal is Signal.State", () => {
	assert(Signal.isState(new DebouncedSignal(0, 0)));
});

Deno.test("DebouncedSignal value is debounced", () => {
	const seed = 0;
	const target = 5;
	const duration = 10;
	const signal = new DebouncedSignal(seed, duration);
	signal.set(target);
	assertEquals(signal.get(), seed, "value was set early");
	setTimeout(
		() => assertEquals(signal.get(), duration),
		target,
		"value did not get set after duration",
	);
});

Deno.test("IntervalSignal is Signal.State", () => {
	assert(Signal.isState(new IntervalSignal(0, (e) => e, 0)));
});

Deno.test("IntervalSignal callback fires after duration", () => {
	const seed = 0;
	function callback(this: { called: boolean }, e: number) {
		this.called = true;
		return e;
	}
	const duration = 10;
	const record = { called: false };
	const signal = new IntervalSignal(seed, callback.bind(record), duration);
	assert(!record.called);
	setTimeout(() => {
		assert(record.called);
		signal.cancel();
	}, duration);
});

Deno.test("IntervalSignal.restart cancels and restarts timer", () => {
	const seed = 0;
	function callback(this: { called: boolean }, e: number) {
		this.called = true;
		return e;
	}
	const duration = 10;
	const record = { called: false };
	const signal = new IntervalSignal(seed, callback.bind(record), duration);
	setTimeout(() => {
		signal.restart();
		setTimeout(() => {
			assert(record.called);
			signal.cancel();
		}, duration);
	}, duration / 5);
	setTimeout(() => assert(!record.called), duration);
});
