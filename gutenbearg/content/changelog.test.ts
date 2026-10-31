import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { changesFrom, draftChangelog, formatChangelog } from "./changelog.ts";
import { ContentEditError } from "./edit.ts";
import { fixture } from "./fixture_test_util.ts";

Deno.test("changelog: commits map onto change types", () => {
	const changes = changesFrom([
		{ subject: "feat(core): signals", body: "" },
		{ subject: "fix(core,router): a crash", body: "" },
		{ subject: "feat(core)!: renamed set", body: "" },
		{ subject: "refactor(core): tidy", body: "BREAKING CHANGE: gone" },
		{ subject: "docs(core): typo", body: "" },
		{ subject: "feat(router): elsewhere", body: "" },
		{ subject: "feat: unscoped", body: "" },
		{ subject: "Merge branch x", body: "" },
	], ["core"]);
	assertEquals(changes, [
		{ type: "added", text: "signals" },
		{ type: "fixed", text: "a crash" },
		{ type: "breaking", text: "renamed set" },
		{ type: "breaking", text: "tidy" },
	]);
	assertEquals(
		formatChangelog(changes.slice(0, 1), new Date(2026, 9, 30)),
		"---\ndate: Oct 30, 2026\n---\n\n- added: signals\n",
	);
});

async function run(cwd: string, ...args: string[]) {
	const out = await new Deno.Command("git", { args, cwd, stdout: "null", stderr: "piped" })
		.output();
	if (!out.success) throw new Error(new TextDecoder().decode(out.stderr));
}

Deno.test("changelog: drafts from commits since the last tag", async () => {
	const root = await fixture({
		"deno.json": JSON.stringify({ workspace: ["./*"] }),
		"core/deno.json": JSON.stringify({ name: "@x/core", version: "0.2.0" }),
		"site/packages/core/0.2/0000-a/0000-b.md": "# B",
	});
	const g = (...a: string[]) => run(root, "-c", "user.name=t", "-c", "user.email=t@t", ...a);
	await g("init", "-q");
	await g("commit", "-q", "--allow-empty", "-m", "feat(core): first");
	await g("tag", "@x/core@0.1.0");
	await g("commit", "-q", "--allow-empty", "-m", "feat(core): second");
	await g("commit", "-q", "--allow-empty", "-m", "fix(core): third");
	await g("commit", "-q", "--allow-empty", "-m", "chore(core): fourth");
	const site = join(root, "site");
	const date = new Date(2026, 9, 30);

	const draft = await draftChangelog(site, "core", { date });
	assertEquals(draft.since, "@x/core@0.1.0");
	assertEquals(draft.file, join(site, "packages/core/changelog/0.2.0.md"));
	assertStringIncludes(await Deno.readTextFile(draft.file), "- added: second\n- fixed: third\n");
	await assertRejects(() => draftChangelog(site, "core", { date }), ContentEditError, "--force");
	await draftChangelog(site, "core", { date, force: true });

	await g("tag", "@x/core@0.2.0");
	await assertRejects(() => draftChangelog(site, "core", { date }), ContentEditError, "--version");
	await g("commit", "-q", "--allow-empty", "-m", "feat(core): fifth");
	const next = await draftChangelog(site, "core", { date, version: "0.3.0" });
	assertEquals(next.since, "@x/core@0.2.0");
	assertEquals(next.changes, [{ type: "added", text: "fifth" }]);

	const past = await draftChangelog(site, "core", { date, version: "0.2.0", force: true });
	assertEquals(past.changes.map((c) => c.text), ["second", "third"]);
});
