import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import {
	ContentEditError,
	copyForward,
	cutVersion,
	newPage,
	newSection,
	reindex,
	resolveDir,
} from "./edit.ts";
import { fixture } from "./fixture_test_util.ts";

async function names(dir: string): Promise<string[]> {
	const out: string[] = [];
	for await (const e of Deno.readDir(dir)) out.push(e.name);
	return out.sort();
}

Deno.test("edit: new pages land by slug, halving the gap", async () => {
	const root = await fixture({
		"guides/0000-[rocket]-start/0000-a.md": "# A",
		"guides/0000-[rocket]-start/0016-b.md": "# B",
	});
	const dir = await resolveDir(root, "guides/start");
	await newPage(root, "guides/start/end");
	await newPage(root, "guides/start/mid", { after: "a" });
	await newPage(root, "guides/start/mid2", { before: "b" });
	assertEquals(await names(dir), [
		"0000-a.md",
		"0008-mid.md",
		"0012-mid2.md",
		"0016-b.md",
		"0032-end.md",
	]);
	await assertRejects(() => newPage(root, "guides/start/a"), ContentEditError, "already exists");
	await assertRejects(
		() => newPage(root, "guides/nope/x"),
		ContentEditError,
		'no directory "nope"',
	);
});

Deno.test("edit: no room asks for a reindex, or does one", async () => {
	const root = await fixture({
		"guides/0000-s/0000-a.md": "",
		"guides/0000-s/0001-b.md": "",
	});
	const dir = await resolveDir(root, "guides/s");
	await assertRejects(
		() => newPage(root, "guides/s/c", { after: "a" }),
		ContentEditError,
		"no room",
	);
	await newPage(root, "guides/s/c", { after: "a", reindex: true });
	assertEquals(await names(dir), ["0000-a.md", "0008-c.md", "0016-b.md"]);
	await newPage(root, "guides/s/first", { before: "a", reindex: true });
	assertEquals(await names(dir), ["0007-first.md", "0016-a.md", "0032-c.md", "0048-b.md"]);
});

Deno.test("edit: reindex respaces in order and keeps icons", async () => {
	const root = await fixture({
		"p/0003-[gear]-z/x.md": "",
		"p/0001-a/x.md": "",
		"p/0002-b/x.md": "",
		"p/loose/x.md": "",
	});
	const dir = join(root, "p");
	const dry = await reindex(dir, "section", { dryRun: true });
	assertEquals(dry.map((m) => m.to), ["0000-a", "0016-b", "0032-[gear]-z"]);
	assertEquals(await names(dir), ["0001-a", "0002-b", "0003-[gear]-z", "loose"]);
	await reindex(dir, "section");
	assertEquals(await names(dir), ["0000-a", "0016-b", "0032-[gear]-z", "loose"]);
	assertEquals(await reindex(dir, "section"), []);
});

Deno.test("edit: sections and versions", async () => {
	const root = await fixture({ "packages/core/0.9/0000-learn/0000-a.md": "" });
	const made = await newSection(root, "packages/core/0.9/api", { icon: "brackets-curly" });
	assertEquals(made.endsWith("0016-[brackets-curly]-api"), true);
	await cutVersion(root, "core", "1.0");
	assertEquals(await names(join(root, "packages/core")), ["0.9", "1.0"]);
	await assertRejects(() => cutVersion(root, "core", "1.0"), ContentEditError, "already exists");
	await assertRejects(() => cutVersion(root, "nope", "1.0"), ContentEditError, "no package");
});

const workspace = (version: string) => ({
	root: "/",
	members: [{ name: "@x/core", version, dir: "/core" }],
});

Deno.test("edit: package shorthand writes into the current version", async () => {
	const root = await fixture({
		"packages/core/0.8/0000-[book-open]-learn/0000-a.md": "# A",
		"packages/core/0.8/0000-[book-open]-learn/0016-b.md": "# B",
	});
	const ws = workspace("0.9.4");
	const file = await newPage(root, "core/learn/c", { workspace: ws });
	assertEquals(file, join(root, "packages/core/0.9/0000-[book-open]-learn/0032-c.md"));
	const mid = await newPage(root, "core/learn/mid", { after: "a", workspace: ws });
	assertEquals(mid.endsWith("0.9/0000-[book-open]-learn/0008-mid.md"), true);
	await assertRejects(
		() => newPage(root, "core/learn/b", { workspace: ws }),
		ContentEditError,
		"use `edit`",
	);
	const sec = await newSection(root, "core/api", { workspace: ws });
	assertEquals(sec, join(root, "packages/core/0.9/0016-api"));
	await assertRejects(
		() => newPage(root, "core/learn/x", { workspace: null }),
		ContentEditError,
		"isn't linked",
	);
});

Deno.test("edit: copyForward keeps names, then is a no-op", async () => {
	const root = await fixture({
		"packages/core/0.8/0016-[gear]-ref/0032-signal.md": "# Signal 0.8",
		"packages/core/0.9/0016-[gear]-ref/0032-signal.md": "# Signal 0.9",
		"packages/core/0.9/0016-[gear]-ref/0048-gone.md": "---\nremoved: true\n---\n",
	});
	const ws = workspace("1.0.0");
	const first = await copyForward(root, "core/ref/signal", { workspace: ws });
	assertEquals(first, {
		file: join(root, "packages/core/1.0/0016-[gear]-ref/0032-signal.md"),
		copied: true,
	});
	assertEquals(await Deno.readTextFile(first.file), "# Signal 0.9");
	assertEquals((await copyForward(root, "core/ref/signal", { workspace: ws })).copied, false);
	await assertRejects(
		() => copyForward(root, "core/ref/gone", { workspace: ws }),
		ContentEditError,
		"removed in 0.9",
	);
	await assertRejects(
		() => copyForward(root, "core/ref/nope", { workspace: ws }),
		ContentEditError,
		"new page",
	);
	// An older version is never read past the current one.
	const old = await copyForward(root, "core/ref/signal", { workspace: workspace("0.8.1") });
	assertEquals(old.copied, false);
	assertEquals(old.file, join(root, "packages/core/0.8/0016-[gear]-ref/0032-signal.md"));
});
