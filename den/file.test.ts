import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { den } from "./mod.ts";
import { discoverIdentity } from "./identity.ts";
import type { Den } from "./types.ts";

/** An app rooted in a fresh temp dir, plus its cleanup. */
async function tempApp(): Promise<[Den, () => Promise<void>]> {
	const home = await Deno.makeTempDir({ prefix: "den-test-" });
	const app = den({ name: "bearcave", home, discover: false, env: () => undefined });
	return [app, () => Deno.remove(home, { recursive: true })];
}

Deno.test("write then read round-trips", async () => {
	const [app, cleanup] = await tempApp();
	try {
		const file = app.config.file("settings.json");
		await file.writeJson({ theme: "dark" });
		assertEquals(await app.config.file("settings.json").readJson(), { theme: "dark" });
	} finally {
		await cleanup();
	}
});

Deno.test("writing creates parent directories", async () => {
	const [app, cleanup] = await tempApp();
	try {
		const file = app.data.file("deeply/nested/notes.txt");
		assertEquals(await file.exists(), false);
		await file.write("hello");
		assertEquals(await file.read(), "hello");
		assertEquals(await app.data.dir("deeply", "nested").exists(), true);
	} finally {
		await cleanup();
	}
});

Deno.test("set stages, flush persists", async () => {
	const [app, cleanup] = await tempApp();
	try {
		const file = app.config.file("staged.txt");
		file.set("pending");

		assertEquals(file.dirty, true);
		assertEquals(await file.exists(), false, "nothing on disk before flush");
		assertEquals(await file.read(), "pending", "the handle reads its own staged writes");

		await file.flush();
		assertEquals(file.dirty, false);
		assertEquals(await app.config.file("staged.txt").read(), "pending");
	} finally {
		await cleanup();
	}
});

Deno.test("discard drops staged content", async () => {
	const [app, cleanup] = await tempApp();
	try {
		const file = app.config.file("discard.txt");
		await file.write("kept");
		file.set("dropped").discard();
		await file.flush();
		assertEquals(await app.config.file("discard.txt").read(), "kept");
	} finally {
		await cleanup();
	}
});

Deno.test("flush on a clean handle is a no-op", async () => {
	const [app, cleanup] = await tempApp();
	try {
		const file = app.config.file("absent.txt");
		await file.flush();
		assertEquals(await file.exists(), false);
	} finally {
		await cleanup();
	}
});

Deno.test("await using flushes on scope exit", async () => {
	const [app, cleanup] = await tempApp();
	try {
		{
			await using file = app.state.file("session.json");
			file.setJson({ open: true });
		}
		assertEquals(await app.state.file("session.json").readJson(), { open: true });
	} finally {
		await cleanup();
	}
});

Deno.test("update reads, transforms and stages", async () => {
	const [app, cleanup] = await tempApp();
	try {
		const file = app.data.file("counter.json");
		await (await file.update<{ n: number }>((current) => ({ n: (current?.n ?? 0) + 1 }))).flush();
		await (await file.update<{ n: number }>((current) => ({ n: (current?.n ?? 0) + 1 }))).flush();
		assertEquals(await app.data.file("counter.json").readJson(), { n: 2 });
	} finally {
		await cleanup();
	}
});

Deno.test("missing files read as undefined, with an optional fallback", async () => {
	const [app, cleanup] = await tempApp();
	try {
		const file = app.cache.file("nope.json");
		assertEquals(await file.read(), undefined);
		assertEquals(await file.readBytes(), undefined);
		assertEquals(await file.readJson(), undefined);
		assertEquals(await file.readJson({ fallback: true }), { fallback: true });
		assertEquals(await file.stat(), undefined);
	} finally {
		await cleanup();
	}
});

Deno.test("unparseable json falls back rather than throwing", async () => {
	const [app, cleanup] = await tempApp();
	try {
		const file = app.cache.file("broken.json");
		await file.write("{ not json");
		assertEquals(await file.readJson(), undefined);
		assertEquals(await file.readJson({ ok: false }), { ok: false });
	} finally {
		await cleanup();
	}
});

Deno.test("bytes round-trip unchanged", async () => {
	const [app, cleanup] = await tempApp();
	try {
		const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
		const file = app.data.file("blob.bin");
		await file.write(bytes);
		assertEquals(await app.data.file("blob.bin").readBytes(), bytes);
	} finally {
		await cleanup();
	}
});

Deno.test("append adds to the end and flushes anything pending first", async () => {
	const [app, cleanup] = await tempApp();
	try {
		const log = app.logs.file("app.log");
		log.set("first\n");
		await log.append("second\n");
		assertEquals(await app.logs.file("app.log").read(), "first\nsecond\n");
	} finally {
		await cleanup();
	}
});

Deno.test("reload picks up an external change", async () => {
	const [app, cleanup] = await tempApp();
	try {
		const file = app.config.file("external.txt");
		await file.write("original");
		assertEquals(await file.read(), "original");

		await Deno.writeTextFile(file.path, "changed underneath");
		assertEquals(await file.read(), "original", "the cached read stands until reloaded");
		assertEquals(await file.reload().read(), "changed underneath");
	} finally {
		await cleanup();
	}
});

Deno.test("remove deletes, and is fine when there is nothing to delete", async () => {
	const [app, cleanup] = await tempApp();
	try {
		const file = app.cache.file("temp.txt");
		await file.write("x");
		await file.remove();
		assertEquals(await file.exists(), false);
		await file.remove();
	} finally {
		await cleanup();
	}
});

Deno.test("an atomic write leaves no temp files behind", async () => {
	const [app, cleanup] = await tempApp();
	try {
		await app.config.file("settings.json").writeJson({ a: 1 });
		const names = (await app.config.list()).map((entry) => entry.name);
		assertEquals(names, ["settings.json"]);
	} finally {
		await cleanup();
	}
});

Deno.test("an atomic write preserves an existing file mode", {
	ignore: Deno.build.os === "windows",
}, async () => {
	const [app, cleanup] = await tempApp();
	try {
		const file = app.config.file("shared.json");
		await file.writeJson({ a: 1 });
		await Deno.chmod(file.path, 0o644);
		await file.writeJson({ a: 2 });
		assertEquals((await Deno.stat(file.path)).mode! & 0o777, 0o644);
	} finally {
		await cleanup();
	}
});

Deno.test("directories list, walk, empty and remove", async () => {
	const [app, cleanup] = await tempApp();
	try {
		assertEquals(await app.cache.list(), [], "a missing directory lists as empty");
		assertEquals(await app.cache.exists(), false);

		await app.cache.file("a.txt").write("a");
		await app.cache.file("nested/b.txt").write("b");
		await app.cache.file("nested/deeper/c.txt").write("c");

		const walked = (await Array.fromAsync(app.cache.walk())).sort();
		assertEquals(walked, ["a.txt", "nested/b.txt", "nested/deeper/c.txt"]);

		await app.cache.empty();
		assertEquals(await app.cache.list(), []);
		assertEquals(await app.cache.exists(), true, "empty keeps the directory itself");

		await app.cache.remove();
		assertEquals(await app.cache.exists(), false);
		await app.cache.remove();
	} finally {
		await cleanup();
	}
});

Deno.test("ensure creates every directory", async () => {
	const [app, cleanup] = await tempApp();
	try {
		await app.ensure();
		for (const path of Object.values(app.paths)) {
			assertEquals((await Deno.stat(path)).isDirectory, true);
		}
	} finally {
		await cleanup();
	}
});

Deno.test("non-atomic writes still round-trip", async () => {
	const home = await Deno.makeTempDir({ prefix: "den-test-" });
	try {
		const app = den({
			name: "bearcave",
			home,
			discover: false,
			atomic: false,
			env: () => undefined,
		});
		await app.data.file("plain.txt").write("written in place");
		assertEquals(await app.data.file("plain.txt").read(), "written in place");
	} finally {
		await Deno.remove(home, { recursive: true });
	}
});

Deno.test("url points at the resolved path", async () => {
	const [app, cleanup] = await tempApp();
	try {
		const file = app.config.file("settings.json");
		assertStringIncludes(file.url.href, "settings.json");
		assertEquals(app.config.url.href.endsWith("/"), true);
	} finally {
		await cleanup();
	}
});

Deno.test("a directory that is really a file surfaces the error", async () => {
	const [app, cleanup] = await tempApp();
	try {
		await app.data.file("collision").write("i am a file");
		await assertRejects(() => app.data.dir("collision").ensure());
	} finally {
		await cleanup();
	}
});

Deno.test("identity is discovered from the nearest den.json", async () => {
	const root = await Deno.makeTempDir({ prefix: "den-discover-" });
	try {
		await Deno.writeTextFile(
			`${root}/den.json`,
			`{
				// the app this tree belongs to
				"name": "discovered",
				"org": "cyborggrizzly",
			}`,
		);
		await Deno.mkdir(`${root}/src/deep`, { recursive: true });

		const identity = discoverIdentity(`${root}/src/deep`);
		assertEquals(identity?.name, "discovered");
		assertEquals(identity?.org, "cyborggrizzly");
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("a scoped deno.json name becomes the bare app name", async () => {
	const root = await Deno.makeTempDir({ prefix: "den-discover-" });
	try {
		await Deno.writeTextFile(`${root}/deno.json`, `{ "name": "@bearmetal/bearcave" }`);
		assertEquals(discoverIdentity(root)?.name, "bearcave");
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("a den field in deno.json wins over the package name", async () => {
	const root = await Deno.makeTempDir({ prefix: "den-discover-" });
	try {
		await Deno.writeTextFile(
			`${root}/deno.json`,
			`{ "name": "@bearmetal/bearcave", "den": { "name": "cave", "org": "cg" } }`,
		);
		const identity = discoverIdentity(root);
		assertEquals(identity?.name, "cave");
		assertEquals(identity?.org, "cg");
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});
