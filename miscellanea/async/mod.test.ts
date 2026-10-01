import { assertEquals, assertRejects } from "@std/assert";
import { Mutex } from "./mod.ts";

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

Deno.test("Mutex runs tasks one at a time, in call order", async () => {
	const lock = new Mutex();
	const log: string[] = [];
	const task = (name: string, ms: number) => async () => {
		log.push(`${name}:start`);
		await tick(ms);
		log.push(`${name}:end`);
		return name;
	};
	const results = await Promise.all([lock.run(task("a", 10)), lock.run(task("b", 0))]);
	assertEquals(results, ["a", "b"]);
	assertEquals(log, ["a:start", "a:end", "b:start", "b:end"]);
});

Deno.test("Mutex keeps going after a rejection", async () => {
	const lock = new Mutex();
	const failed = lock.run(() => Promise.reject(new Error("boom")));
	const next = lock.run(() => 2);
	await assertRejects(() => failed, Error, "boom");
	assertEquals(await next, 2);
});

Deno.test("Mutex reports pending and idle", async () => {
	const lock = new Mutex();
	assertEquals(lock.locked, false);
	lock.run(() => tick(5));
	lock.run(() => tick(5));
	assertEquals(lock.pending, 2);
	await lock.idle();
	assertEquals(lock.locked, false);
});
