import { assertEquals, assertMatch, assertNotEquals } from "@std/assert";
import { den } from "./mod.ts";
import type { Den } from "./types.ts";

async function tempApp(): Promise<[Den, () => Promise<void>]> {
	const home = await Deno.makeTempDir({ prefix: "den-test-" });
	const app = den({ name: "bearcave", home, discover: false, env: () => undefined });
	return [app, () => Deno.remove(home, { recursive: true })];
}

Deno.test("rotation keeps the newest `keep`, newest first", async () => {
	const [app, cleanup] = await tempApp();
	try {
		const backups = app.data.rotation("/home/me/Drowned Bell.tmstn", { keep: 3 });
		for (let i = 0; i < 5; i++) await backups.push(`v${i}`);
		const entries = await backups.list();
		assertEquals(entries.length, 3);
		assertEquals(await Promise.all(entries.map((e) => e.file.read())), ["v4", "v3", "v2"]);
		assertEquals(await (await backups.latest())?.read(), "v4");
		for (const { name } of entries) assertMatch(name, /^\d{8}T\d{9}Z-\d{3}\.bak$/);
	} finally {
		await cleanup();
	}
});

Deno.test("rotation keys never share entries, even when one prefixes another", async () => {
	const [app, cleanup] = await tempApp();
	try {
		const short = app.data.rotation("/books/Bell.tmstn", { keep: 1 });
		const long = app.data.rotation("/books/Bell.tmstn.old", { keep: 1 });
		const otherDir = app.data.rotation("/elsewhere/Bell.tmstn", { keep: 1 });
		await short.push("short");
		await long.push("long");
		await otherDir.push("other");
		await short.push("short 2");
		assertEquals(await (await long.latest())?.read(), "long");
		assertEquals(await (await otherDir.latest())?.read(), "other");
		assertNotEquals(short.dir.path, otherDir.dir.path);
		await short.clear();
		assertEquals(await short.list(), []);
		assertEquals((await long.list()).length, 1);
	} finally {
		await cleanup();
	}
});

Deno.test("rotation pushFile copies a source in", async () => {
	const [app, cleanup] = await tempApp();
	try {
		const source = app.data.file("doc.txt");
		await source.write("on disk");
		const backups = app.data.rotation("doc");
		const entry = await backups.pushFile(source.path);
		assertEquals(await entry.read(), "on disk");
		assertEquals((await backups.list()).length, 1);
	} finally {
		await cleanup();
	}
});

Deno.test("rotation entries pushed in the same millisecond keep their order", async () => {
	const [app, cleanup] = await tempApp();
	try {
		const backups = app.data.rotation("rapid", { keep: 50, extension: "" });
		await Promise.all(Array.from({ length: 10 }, (_, i) => backups.push(String(i))));
		const entries = await backups.list();
		assertEquals(entries.length, 10);
		assertEquals(new Set(entries.map((e) => e.name)).size, 10);
		assertEquals(entries.every((e) => !e.name.includes(".")), true);
	} finally {
		await cleanup();
	}
});
