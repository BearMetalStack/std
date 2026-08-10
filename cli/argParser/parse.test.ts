/**
 * Parsing strictness: everything that used to be dropped on the floor.
 * @module
 */

import { assertEquals, assertInstanceOf, assertRejects, assertStringIncludes } from "@std/assert";
import { ArgParseError, ArgParser } from "./mod.ts";
import { setColorEnabled } from "../style.ts";

setColorEnabled(false);

async function issuesOf(argv: string[], defs: Record<string, unknown>): Promise<string[]> {
	const error = await assertRejects(
		// deno-lint-ignore no-explicit-any
		() => new ArgParser(argv, defs as any).resolve(),
	);
	assertInstanceOf(error, ArgParseError);
	return [...error.issues];
}

// ─── Nothing is dropped silently ──────────────────────────────────────────────

Deno.test("a mistyped option is an error, not a no-op", async () => {
	const issues = await issuesOf(["--contnet=words"], {
		content: { type: "string" },
	});
	assertEquals(issues.length, 1);
	assertStringIncludes(issues[0], "Unknown option --contnet");
	assertStringIncludes(issues[0], "Did you mean --content?");
});

Deno.test("an unknown option with no near match suggests nothing", async () => {
	const issues = await issuesOf(["--wildly-unrelated=1"], { content: { type: "string" } });
	assertEquals(issues, ["Unknown option --wildly-unrelated"]);
});

Deno.test("a space-separated value is an error rather than a lost value", async () => {
	const issues = await issuesOf(["--title", "Typo Test"], { title: { type: "string" } });
	assertEquals(issues.length, 1);
	assertStringIncludes(issues[0], "--title needs a value");
	assertStringIncludes(issues[0], "--title=<value>");
});

Deno.test("every problem is reported in one pass", async () => {
	const issues = await issuesOf(["--titel=x", "--content", "y", "--nope"], {
		title: { type: "string" },
		content: { type: "string" },
	});
	assertEquals(issues.length, 3);
});

Deno.test("short aliases carry values", async () => {
	const parser = new ArgParser(["-f=notes.md"], {
		file: { type: "string", aliases: ["-f"] },
	});
	assertEquals((await parser.resolve()).file, "notes.md");
});

Deno.test("a flag accepts an explicit boolean and rejects anything else", async () => {
	const defs = { dryRun: { type: "flag" } } as const;
	assertEquals((await new ArgParser(["--dry-run=true"], defs).resolve()).dryRun, true);
	assertEquals((await new ArgParser(["--dry-run=no"], defs).resolve()).dryRun, false);

	const issues = await issuesOf(["--dry-run=maybe"], defs);
	assertStringIncludes(issues[0], "expects true or false");
});

Deno.test("a bad enum member reports instead of throwing from the constructor", async () => {
	const defs = { db: { type: "enum", values: ["postgres", "kv"] } } as const;
	// Constructing must not throw — `--help` has to stay reachable on a bad command line.
	const parser = new ArgParser(["--db=mysql"], defs);
	assertEquals(parser.issues.length, 1);
	assertStringIncludes(parser.issues[0], `Invalid value "mysql" for --db`);
	await assertRejects(() => parser.resolve(), ArgParseError);
});

Deno.test("a number that is not a number is an error", async () => {
	const issues = await issuesOf(["--port=http"], { port: { type: "number" } });
	assertStringIncludes(issues[0], `--port expects a number, got "http"`);
});

Deno.test("-- ends option parsing", async () => {
	const parser = new ArgParser(["--", "--not-an-option"], { real: { type: "flag" } });
	await parser.resolve();
	assertEquals(parser.issues, []);
});

Deno.test("a negative number is a value, not an option", async () => {
	const parser = new ArgParser(["-5"], { real: { type: "flag" } });
	await parser.resolve();
	assertEquals(parser.issues, []);
});
