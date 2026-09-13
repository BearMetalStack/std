import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { joinPath } from "@bearmetal/miscellanea";
import { resolveEntrypoints } from "./discovery.ts";

async function tempTree(files: Record<string, string>): Promise<string> {
	const root = await Deno.makeTempDir();
	for (const [rel, contents] of Object.entries(files)) {
		const path = joinPath(root, rel);
		await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
		await Deno.writeTextFile(path, contents);
	}
	return root;
}

async function cleanup(...dirs: (string | undefined)[]): Promise<void> {
	for (const dir of dirs) {
		if (dir) await Deno.remove(dir, { recursive: true }).catch(() => {});
	}
}

Deno.test("nested @components manifests are discovered and keyed by path", async () => {
	const components = await tempTree({
		"main.manifest.ts": `import "./main.tsx";`,
		"main.tsx": `export const x = 1;`,
		"users/_id.manifest.ts": `import "./profile.tsx";`,
		"users/profile.tsx": `export const y = 1;`,
	});
	let resolved;
	try {
		resolved = await resolveEntrypoints(components, null, null);
		assertEquals(resolved.componentManifestKeys, new Set(["main", "users/_id"]));
		assertEquals(resolved.entrypoints.length, 1);
		assertEquals(resolved.sideEffects.length, 2);

		const entry = await Deno.readTextFile(resolved.entrypoints[0].path);
		assertStringIncludes(entry, "main.manifest.ts");
		assertStringIncludes(entry, "users/_id.manifest.ts");
	} finally {
		await cleanup(components, resolved?.tempDir);
	}
});

Deno.test("no manifest anywhere falls back to globbing every component", async () => {
	const components = await tempTree({
		"counter.tsx": `export const a = 1;`,
		"nested/widget.tsx": `export const b = 1;`,
	});
	let resolved;
	try {
		resolved = await resolveEntrypoints(components, null, null);
		assertEquals(resolved.componentManifestKeys.size, 0);
		assertEquals(resolved.sideEffects.length, 2);

		const entry = await Deno.readTextFile(resolved.entrypoints[0].path);
		assertStringIncludes(entry, "counter.tsx");
		assertStringIncludes(entry, "nested/widget.tsx");
	} finally {
		await cleanup(components, resolved?.tempDir);
	}
});

Deno.test("@app files are always included, whether or not anything imports them", async () => {
	const app = await tempTree({
		"stores/users.ts": `export const usersStore = {};`,
	});
	let resolved;
	try {
		resolved = await resolveEntrypoints(null, app, null);
		const entry = await Deno.readTextFile(resolved.entrypoints[0].path);
		assertStringIncludes(entry, "stores/users.ts");
	} finally {
		await cleanup(app, resolved?.tempDir);
	}
});

Deno.test("@pages files are keyed by path and the entry ends with a dispatch() call", async () => {
	const pages = await tempTree({
		"main.ts": `import { registerPage } from "@bearmetal/app";`,
		"users/_id.ts": `import { registerPage } from "@bearmetal/app";`,
	});
	let resolved;
	try {
		resolved = await resolveEntrypoints(null, null, pages);
		assertEquals(resolved.pageKeys, new Set(["main", "users/_id"]));

		const entry = await Deno.readTextFile(resolved.entrypoints[0].path);
		assertStringIncludes(entry, "users/_id.ts");
		assert(entry.trim().endsWith("dispatch();"));
	} finally {
		await cleanup(pages, resolved?.tempDir);
	}
});

Deno.test("nothing to bundle when no directory has anything in it", async () => {
	const resolved = await resolveEntrypoints(null, null, null);
	assertEquals(resolved.entrypoints.length, 0);
	assertEquals(resolved.sideEffects.length, 0);
	assertEquals(resolved.componentManifestKeys.size, 0);
	assertEquals(resolved.pageKeys.size, 0);
});
