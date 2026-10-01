import { assert, assertEquals } from "@std/assert";
import {
	createComputed,
	createLazySignals,
	DebouncedSignal,
	effect,
	IntervalSignal,
	LazySignal,
} from "./bmsignals.ts";
import { Signal } from "./signals/wrapper.ts";

Deno.test("DebouncedSignal is Signal.State", () => {
	assert(Signal.isState(new DebouncedSignal(0, 0)));
});

Deno.test("DebouncedSignal value is debounced", async () => {
	const seed = 0;
	const target = 5;
	const duration = 10;
	const signal = new DebouncedSignal(seed, duration);
	signal.set(target);
	assertEquals(signal.get(), seed, "value was set early");
	await new Promise((r) => setTimeout(r, duration + 5));
	assertEquals(signal.get(), target, "value did not get set after duration");
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

Deno.test("LazySignal fetches once however often it is read before the fetch lands", async () => {
	let fetches = 0;
	const s = new LazySignal<number[]>([], () => {
		fetches++;
		return Promise.resolve([1]);
	});
	s.get();
	s.get();
	s.get();
	await new Promise((r) => setTimeout(r, 0));
	assertEquals(fetches, 1);
	assertEquals(s.get(), [1]);
	await s.refresh();
	assertEquals(fetches, 2);
});

Deno.test("createLazySignals hands back the same signal for the same arguments", async () => {
	let fetches = 0;
	const chars = createLazySignals<[string], string[]>([], (project) => {
		fetches++;
		return Promise.resolve([`${project}-hero`]);
	});
	assert(chars("bell") === chars("bell"));
	assert(chars("bell") !== chars("other"));

	const names = createComputed(() => chars("bell").get().join());
	const seen: string[] = [];
	const stop = effect(() => {
		seen.push(names.get());
	});
	await new Promise((r) => setTimeout(r, 0));
	assertEquals(seen, ["", "bell-hero"], "a re-running computed sees the fetch land");
	assertEquals(fetches, 1, "fetched once, and only for the key that was read");

	chars.delete("bell");
	assert(chars("bell").get().length === 0, "deleted keys start over");
	stop();
});
