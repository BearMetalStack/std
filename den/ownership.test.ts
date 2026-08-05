import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { den, DenOwnershipError, MARKER } from "./mod.ts";
import { compiledAncestors, isCompiled } from "./compiled.ts";
import type { Den, DenWarning } from "./types.ts";

/** An app rooted in a fresh temp dir, with its warnings captured rather than printed. */
async function tempApp(
	overrides: Parameters<typeof den>[0] = {},
): Promise<[Den, DenWarning[], () => Promise<void>]> {
	const home = await Deno.makeTempDir({ prefix: "den-own-" });
	const warnings: DenWarning[] = [];
	const app = den({
		name: "bearcave",
		home,
		discover: false,
		env: () => undefined,
		onWarning: (w) => warnings.push(w),
		...overrides,
	});
	return [app, warnings, () => Deno.remove(home, { recursive: true })];
}

Deno.test("ensure claims every directory, and says nothing on a clean start", async () => {
	const [app, warnings, cleanup] = await tempApp();
	try {
		await app.ensure();
		assertEquals(warnings, []);

		const reports = await app.inspect();
		assertEquals(reports.map((r) => r.status), Array(6).fill("owned"));

		const marker = JSON.parse(await Deno.readTextFile(`${app.config.path}/${MARKER}`));
		assertEquals(marker.app, "bearcave");
		assertEquals(marker.kind, "config");
		assertEquals(marker.den, 1);
	} finally {
		await cleanup();
	}
});

Deno.test("ensure is idempotent and stays quiet on later runs", async () => {
	const [app, warnings, cleanup] = await tempApp();
	try {
		await app.ensure();
		const first = await Deno.readTextFile(`${app.data.path}/${MARKER}`);
		await app.ensure();
		await app.ensure();
		assertEquals(warnings, []);
		assertEquals(await Deno.readTextFile(`${app.data.path}/${MARKER}`), first, "marker untouched");
	} finally {
		await cleanup();
	}
});

Deno.test("a directory owned by another app is reported, warned about, and left alone", async () => {
	const [app, warnings, cleanup] = await tempApp();
	try {
		await Deno.mkdir(app.config.path, { recursive: true });
		await Deno.writeTextFile(
			`${app.config.path}/${MARKER}`,
			JSON.stringify({ app: "someone-else", kind: "config", den: 1, created: "2026-01-01" }),
		);
		await Deno.writeTextFile(`${app.config.path}/theirs.json`, `{"not":"ours"}`);

		await app.ensure();

		assertEquals(warnings.length, 1);
		assertEquals(warnings[0].code, "conflict");
		assertStringIncludes(warnings[0].message, "someone-else");

		const config = (await app.inspect()).find((r) => r.kind === "config")!;
		assertEquals(config.status, "conflict");
		assertEquals(config.owner?.app, "someone-else");

		assertEquals(
			await Deno.readTextFile(`${app.config.path}/theirs.json`),
			`{"not":"ours"}`,
			"their content is untouched",
		);
		assertEquals(
			JSON.parse(await Deno.readTextFile(`${app.config.path}/${MARKER}`)).app,
			"someone-else",
			"their marker is not overwritten",
		);
	} finally {
		await cleanup();
	}
});

Deno.test("pre-existing content warns once, then is adopted", async () => {
	const [app, warnings, cleanup] = await tempApp();
	try {
		await Deno.mkdir(app.data.path, { recursive: true });
		await Deno.writeTextFile(`${app.data.path}/legacy.json`, "{}");

		await app.ensure();
		assertEquals(warnings.map((w) => w.code), ["unclaimed"]);
		assertStringIncludes(warnings[0].message, app.data.path);

		await app.ensure();
		assertEquals(warnings.length, 1, "adopted, so the second run is quiet");
		assertEquals(await app.data.file("legacy.json").exists(), true, "content survives adoption");
	} finally {
		await cleanup();
	}
});

Deno.test("an empty directory is claimed without comment", async () => {
	const [app, warnings, cleanup] = await tempApp();
	try {
		await Deno.mkdir(app.cache.path, { recursive: true });
		await app.ensure();
		assertEquals(warnings, []);
		assertEquals((await app.cache.inspect()).status, "owned");
	} finally {
		await cleanup();
	}
});

Deno.test("a file where a directory should be is a conflict, not a crash", async () => {
	const home = await Deno.makeTempDir({ prefix: "den-own-" });
	try {
		const warnings: DenWarning[] = [];
		const app = den({
			name: "bearcave",
			home,
			discover: false,
			env: () => undefined,
			onWarning: (w) => warnings.push(w),
		});
		await Deno.writeTextFile(app.cache.path, "i am a file");

		await app.ensure();
		assertEquals(warnings.map((w) => w.code), ["conflict"]);
		assertStringIncludes(warnings[0].message, "is a file, not a directory");
	} finally {
		await Deno.remove(home, { recursive: true });
	}
});

Deno.test("two kinds on one path are caught before any I/O", () => {
	const warnings: DenWarning[] = [];
	den({
		name: "bearcave",
		home: "/nonexistent-on-purpose",
		dirs: { cache: "/shared/spot", state: "/shared/spot" },
		discover: false,
		env: () => undefined,
		onWarning: (w) => warnings.push(w),
	});

	assertEquals(warnings.length, 1);
	assertEquals(warnings[0].code, "collision");
	assertEquals(warnings[0].kinds, ["cache", "state"]);
	assertStringIncludes(warnings[0].message, "/shared/spot");
});

Deno.test("the marker is invisible to list and walk, and survives empty", async () => {
	const [app, , cleanup] = await tempApp();
	try {
		await app.ensure();
		await app.cache.file("a.txt").write("a");
		await app.cache.file("nested/b.txt").write("b");

		assertEquals((await app.cache.list()).map((e) => e.name).sort(), ["a.txt", "nested"]);
		assertEquals((await Array.fromAsync(app.cache.walk())).sort(), ["a.txt", "nested/b.txt"]);

		await app.cache.empty();
		assertEquals(await app.cache.list(), []);
		assertEquals((await app.cache.inspect()).status, "owned", "emptying is not disowning");
	} finally {
		await cleanup();
	}
});

Deno.test("empty and remove refuse to touch another app's directory", async () => {
	const [app, , cleanup] = await tempApp();
	try {
		await Deno.mkdir(app.cache.path, { recursive: true });
		await Deno.writeTextFile(
			`${app.cache.path}/${MARKER}`,
			JSON.stringify({ app: "someone-else", kind: "cache", den: 1, created: "2026-01-01" }),
		);
		await Deno.writeTextFile(`${app.cache.path}/precious.txt`, "theirs");

		await assertRejects(() => app.cache.empty(), DenOwnershipError);
		await assertRejects(() => app.cache.remove(), DenOwnershipError);
		assertEquals(await Deno.readTextFile(`${app.cache.path}/precious.txt`), "theirs");

		await app.cache.remove({ force: true });
		assertEquals(await app.cache.exists(), false);
	} finally {
		await cleanup();
	}
});

Deno.test("claim refuses to overwrite another app's marker", async () => {
	const [app, , cleanup] = await tempApp();
	try {
		await Deno.mkdir(app.logs.path, { recursive: true });
		await Deno.writeTextFile(
			`${app.logs.path}/${MARKER}`,
			JSON.stringify({ app: "someone-else", kind: "logs", den: 1, created: "2026-01-01" }),
		);
		await assertRejects(() => app.logs.claim(), DenOwnershipError);
	} finally {
		await cleanup();
	}
});

Deno.test("a corrupt marker is treated as no marker", async () => {
	const [app, warnings, cleanup] = await tempApp();
	try {
		await Deno.mkdir(app.state.path, { recursive: true });
		await Deno.writeTextFile(`${app.state.path}/${MARKER}`, "{{{ not json");

		assertEquals(await app.state.owner(), undefined);
		await app.ensure();
		assertEquals(warnings, [], "an empty directory with a junk marker is just claimable");
		assertEquals((await app.state.inspect()).status, "owned");
	} finally {
		await cleanup();
	}
});

Deno.test("nested directories carry no ownership of their own", async () => {
	const [app, , cleanup] = await tempApp();
	try {
		await app.ensure();
		const nested = app.data.dir("projects");
		await nested.ensure();
		assertEquals(await nested.owner(), undefined);
		await assertRejects(() => nested.claim(), DenOwnershipError);
		await nested.remove(); // unowned, so no ownership check blocks it
	} finally {
		await cleanup();
	}
});

Deno.test("compiled-only helpers report honestly when running from source", () => {
	assertEquals(isCompiled(), false);
	assertEquals(compiledAncestors(), []);
});
