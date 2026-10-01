import { assertEquals, assertRejects } from "@std/assert";
import { setCurrentOwner } from "@bearmetal/jsx";
import { createSaveTask, flushAllSaves, hasUnsavedSaves } from "./save.ts";

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** A save function whose calls resolve when the test says so. */
function controlled<T>() {
	const calls: { value: T; resolve: () => void; reject: (e: unknown) => void }[] = [];
	const save = (value: T) =>
		new Promise<void>((resolve, reject) => calls.push({ value, resolve, reject }));
	return { calls, save };
}

Deno.test("schedule debounces to one save of the last value", async () => {
	setCurrentOwner(null);
	const saved: string[] = [];
	const task = createSaveTask((v: string) => void saved.push(v), { debounceMs: 5 });
	task.schedule("a");
	task.schedule("ab");
	task.schedule("abc");
	assertEquals(task.status.get(), "pending");
	assertEquals(task.dirty.get(), true);
	await wait(20);
	assertEquals(saved, ["abc"]);
	assertEquals(task.status.get(), "saved");
	assertEquals(task.dirty.get(), false);
	await task.dispose();
});

Deno.test("an edit landing mid-save is saved next, not marked saved", async () => {
	setCurrentOwner(null);
	const { calls, save } = controlled<string>();
	const task = createSaveTask(save, { debounceMs: 1 });
	const first = task.flush();
	task.schedule("one");
	const flushing = task.flush();
	await wait();
	assertEquals(calls.map((c) => c.value), ["one"]);

	task.schedule("two");
	calls[0].resolve();
	await wait();
	assertEquals(task.status.get() === "saved", false, "'one' finishing does not make 'two' saved");

	await wait(5);
	assertEquals(calls.map((c) => c.value), ["one", "two"]);
	calls[1].resolve();
	await flushing;
	await first;
	await wait();
	assertEquals(task.status.get(), "saved");
	await task.dispose();
});

Deno.test("flush waits for a save in flight before deciding", async () => {
	setCurrentOwner(null);
	const { calls, save } = controlled<number>();
	const task = createSaveTask(save, { debounceMs: 1 });
	task.schedule(1);
	await wait(5);
	assertEquals(calls.length, 1, "the debounce started a save");

	let flushed = false;
	const flush = task.flush().then(() => flushed = true);
	await wait();
	assertEquals(flushed, false, "flush does not resolve while the save is running");
	calls[0].resolve();
	await flush;
	assertEquals(calls.length, 1, "and does not save the same edit twice");
	await task.dispose();
});

Deno.test("a failed save stays dirty, reports, and retries", async () => {
	setCurrentOwner(null);
	let attempts = 0;
	const task = createSaveTask(() => {
		if (++attempts === 1) throw new Error("offline");
	}, { debounceMs: 1, retryMs: 5 });
	task.schedule("x");
	await assertRejects(() => task.flush(), Error, "offline");
	assertEquals(task.status.get(), "error");
	assertEquals(task.dirty.get(), true);
	assertEquals((task.error.get() as Error).message, "offline");
	assertEquals(hasUnsavedSaves(), true);

	await wait(20);
	assertEquals(attempts, 2);
	assertEquals(task.status.get(), "saved");
	assertEquals(task.error.get(), undefined);
	await task.dispose();
});

Deno.test("flushAllSaves saves every kind of task at once", async () => {
	setCurrentOwner(null);
	const saved: string[] = [];
	const doc = createSaveTask((v: string) => void saved.push(`doc:${v}`), { debounceMs: 1000 });
	const sheet = createSaveTask((v: string) => void saved.push(`sheet:${v}`), { debounceMs: 1000 });
	const broken = createSaveTask(() => {
		throw new Error("nope");
	}, { debounceMs: 1000, retryMs: false, label: "broken" });
	doc.schedule("a");
	sheet.schedule("b");
	broken.schedule("c");

	const failures = await flushAllSaves();
	assertEquals(saved.sort(), ["doc:a", "sheet:b"]);
	assertEquals(failures.map((f) => f.task.label), ["broken"]);
	broken.cancel();
	await Promise.all([doc.dispose(), sheet.dispose(), broken.dispose()]);
	assertEquals(hasUnsavedSaves(), false);
});

Deno.test("cancel drops the unsaved edit", async () => {
	setCurrentOwner(null);
	const saved: number[] = [];
	const task = createSaveTask((v: number) => void saved.push(v), { debounceMs: 5 });
	task.schedule(1);
	task.cancel();
	await wait(15);
	assertEquals(saved, []);
	assertEquals(task.dirty.get(), false);
	await task.dispose();
});

Deno.test("an owned task is flushed when its owner tears down", async () => {
	const cleanups: (() => void)[] = [];
	setCurrentOwner({ registerCleanup: (fn) => cleanups.push(fn) });
	const saved: string[] = [];
	const task = createSaveTask((v: string) => void saved.push(v), { debounceMs: 1000 });
	setCurrentOwner(null);
	task.schedule("draft");
	cleanups.forEach((fn) => fn());
	await wait();
	assertEquals(saved, ["draft"]);
});
