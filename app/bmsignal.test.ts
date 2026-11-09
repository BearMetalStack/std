import { assert, assertEquals } from "@std/assert";
import {
	ArraySignal,
	createComputed,
	createLazySignals,
	DebouncedSignal,
	DirtyArraySignal,
	DirtySignal,
	effect,
	IntervalSignal,
	LazySignal,
	StructSignal,
} from "./bmsignals.ts";
import { setCurrentOwner } from "@bearmetal/jsx/jsx-runtime";
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

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

Deno.test("IntervalSignal.setDuration keeps the interval running at the new rate", async () => {
	const s = new IntervalSignal(0, (v) => v + 1, 1000);
	s.setDuration(5);
	await tick(30);
	s.cancel();
	assert(s.get() > 0, "the interval restarted after setDuration");
});

Deno.test("IntervalSignal is cancelled cleanly with its owner", () => {
	const cleanups: (() => void)[] = [];
	setCurrentOwner({ registerCleanup: (fn) => cleanups.push(fn) });
	try {
		new IntervalSignal(0, (v) => v + 1, 5);
	} finally {
		setCurrentOwner(null);
	}
	for (const fn of cleanups) fn();
});

Deno.test("StructSignal field signals stay live across set()", () => {
	const s = new StructSignal({ a: 1, b: 2 });
	const a = s.$.a;
	s.set({ a: 10, b: 20 });
	a.set(11);
	assertEquals(s.$.a.get(), 11, "the field signal held before set() still writes through");
	assert(s.$.a === a, "the same field signal is handed back");
});

Deno.test("StructSignal has fields for keys added after construction", () => {
	const s = new StructSignal<{ a: number; b?: number }>({ a: 1 });
	s.set({ a: 1, b: 2 });
	assertEquals(s.$.b?.get(), 2);
});

Deno.test("ArraySignal.get() keeps its identity until the array changes", () => {
	const s = new ArraySignal([1, 2]);
	assert(s.get() === s.get());
});

Deno.test("ArraySignal index writes do not mutate the previous snapshot", () => {
	const s = new ArraySignal([1, 2]);
	const before = Signal.subtle.untrack(() => [...s.get()]);
	const prevSnapshot = Signal.State.prototype.get.call(s) as number[];
	s.get()[0] = 9;
	assertEquals(prevSnapshot, before, "the snapshot readers already had is unchanged");
	assertEquals([...s.get()], [9, 2]);
});

Deno.test("ArraySignal length writes notify", async () => {
	const s = new ArraySignal([1, 2, 3]);
	const seen: number[] = [];
	const stop = effect(() => {
		seen.push(s.get().length);
	});
	s.get().length = 1;
	await tick();
	stop();
	assertEquals(seen, [3, 1]);
});

Deno.test("LazySignal does not refetch on every read after a failure", async () => {
	let calls = 0;
	const origError = console.error;
	console.error = () => {};
	try {
		const s = new LazySignal(0, () => {
			calls++;
			return Promise.reject(new Error("nope"));
		});
		s.get();
		await tick();
		s.get();
		s.get();
		await tick();
		assertEquals(calls, 1);
		assert(s.error.get() instanceof Error, "the failure is on error");
		assertEquals(s.loading.get(), false);
	} finally {
		console.error = origError;
	}
});

Deno.test("DebouncedSignal reports pending and can be flushed", () => {
	const s = new DebouncedSignal(0, 1000);
	s.set(5);
	assertEquals(s.pending.get(), true);
	s.flush();
	assertEquals(s.get(), 5);
	assertEquals(s.pending.get(), false);
});

Deno.test("DirtySignal stays clean when set to an equal value", () => {
	const s = new DirtySignal("a");
	s.set("a");
	assertEquals(s.isDirty(), false);
	s.set("b");
	assertEquals(s.isDirty(), true);
});

Deno.test("DirtyArraySignal stays clean when set to an equal array", () => {
	const s = new DirtyArraySignal(["a"]);
	s.set(["a"]);
	assertEquals(s.isDirty(), false);
});

Deno.test("several changes through one held ArraySignal array all apply", () => {
	const s = new ArraySignal<number>([0, 0]);
	const arr = s.get();
	arr[0] = 1;
	arr[1] = 2;
	arr.push(3);
	arr.push(4);
	assertEquals([...s.get()], [1, 2, 3, 4]);
	assertEquals(arr.length, 4, "the held array reads the latest value");
});
