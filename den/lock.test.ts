import { assert, assertEquals } from "@std/assert";
import { den } from "./mod.ts";
import type { Den } from "./types.ts";

async function tempApp(): Promise<[Den, string, () => Promise<void>]> {
	const home = await Deno.makeTempDir({ prefix: "den-test-" });
	const app = den({ name: "bearcave", home, discover: false, env: () => undefined });
	return [app, home, () => Deno.remove(home, { recursive: true })];
}

Deno.test("a lock is exclusive until released", async () => {
	const [app, , cleanup] = await tempApp();
	try {
		const first = await app.state.lock("session", { label: "window 1" });
		assert(first);
		assertEquals(await app.state.lock("session"), null);
		const holder = await app.state.lockHolder("session");
		assertEquals(holder?.pid, Deno.pid);
		assertEquals(holder?.label, "window 1");
		await first.release();
		assertEquals(first.held, false);
		const second = await app.state.lock("session");
		assert(second);
		await second.release({ remove: true });
		assertEquals(await app.state.lockHolder("session"), undefined);
	} finally {
		await cleanup();
	}
});

Deno.test("lockPath treats every spelling of a file as one lock", async () => {
	const [app, home, cleanup] = await tempApp();
	try {
		await Deno.mkdir(`${home}/books`);
		await Deno.writeTextFile(`${home}/books/bell.tmstn`, "");
		await Deno.symlink(`${home}/books`, `${home}/shelf`);
		const lock = await app.state.lockPath(`${home}/books/bell.tmstn`);
		assert(lock);
		assertEquals(await app.state.lockPath(`${home}/shelf/../books/./bell.tmstn`), null);
		assertEquals(await app.state.lockPath(`${home}/shelf/bell.tmstn`), null);
		assertEquals((await app.state.lockPathHolder(`${home}/shelf/bell.tmstn`))?.pid, Deno.pid);
		assert(await app.state.lockPath(`${home}/books/other.tmstn`));
		await lock.release();
	} finally {
		await cleanup();
	}
});

Deno.test("a lock removed under a waiter's feet is not double-held", async () => {
	const [app, , cleanup] = await tempApp();
	try {
		const first = await app.state.lock("x");
		assert(first);
		await first.release({ remove: true });
		const a = await app.state.lock("x");
		const b = await app.state.lock("x");
		assert(a);
		assertEquals(b, null);
		await a.release();
	} finally {
		await cleanup();
	}
});
