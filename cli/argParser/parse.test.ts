/**
 * Parsing strictness, nesting, positionals, and the pieces `resolve()` no longer owns alone.
 * @module
 */

import { assertEquals, assertInstanceOf, assertRejects, assertStringIncludes } from "@std/assert";
import { ArgParseError, ArgParser, HelpRequested, promptFor } from "./mod.ts";
import { canPrompt, startCliSession } from "../render/mod.ts";
import { BufferWriter, FakeKeyReader } from "../testing.ts";
import { setColorEnabled } from "../style.ts";

setColorEnabled(false);

const settled = () => new Promise<void>((r) => setTimeout(r, 0));

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
	const parser = new ArgParser(["--", "--not-an-option"], {
		file: { type: "positional", required: true },
	});
	assertEquals((await parser.resolve()).file, "--not-an-option");
});

Deno.test("a negative number is a value, not an option", async () => {
	const parser = new ArgParser(["-5"], { offset: { type: "positional" } });
	assertEquals((await parser.resolve()).offset, "-5");
});

// ─── Positionals ──────────────────────────────────────────────────────────────

Deno.test("positionals bind by declaration order, with a variadic tail", async () => {
	const parser = new ArgParser(["a.md", "b.md", "c.md"], {
		draft: { type: "positional", required: true },
		refs: { type: "positional", variadic: true },
	});
	const args = await parser.resolve();
	// No `as const` needed: the names are the keys, and `required`/`variadic` are literal `true`.
	const draft: string = args.draft;
	const refs: string[] = args.refs;
	assertEquals(draft, "a.md");
	assertEquals(refs, ["b.md", "c.md"]);
});

Deno.test("a missing required positional is an error", async () => {
	const issues = await issuesOf([], { draft: { type: "positional", required: true } });
	assertEquals(issues, ["Missing required argument <draft>"]);
});

Deno.test("surplus positionals are an error once any are declared", async () => {
	const issues = await issuesOf(["one", "two"], { draft: { type: "positional" } });
	assertEquals(issues, [`Unexpected argument "two"`]);
});

Deno.test("declaring no positionals at all leaves them unchecked", async () => {
	const parser = new ArgParser(["anything", "goes"], { flagged: { type: "flag" } });
	await parser.resolve();
	assertEquals(parser.nonFlags, ["anything", "goes"]);
});

Deno.test("positionals appear in the usage line and their own help section", () => {
	const parser = new ArgParser([], {
		draft: { type: "positional", required: true, $description: "Draft file" },
		refs: { type: "positional", variadic: true },
		title: { type: "string" },
	});
	const help = parser.helpText("tmstn chapter new");
	assertStringIncludes(help, "Usage: tmstn chapter new [options] <draft> [refs...]");
	assertStringIncludes(help, "<draft>");
	assertStringIncludes(help, "Draft file");
});

// ─── Nested commands ──────────────────────────────────────────────────────────

const nested = {
	$root: {
		json: { type: "flag" },
		nonInteractive: { type: "flag", aliases: ["-n"] },
	},
	$requireCommand: true,
	chapter: {
		$description: "Chapter operations",
		verbose: { type: "flag", aliases: ["-v"] },
		$commands: {
			list: { $description: "List chapters" },
			new: {
				title: { type: "string" },
				draft: { type: "positional", required: true },
			},
		},
	},
	build: { $description: "Build the book" },
} as const;

Deno.test("a nested command resolves without pre-joining its tokens", async () => {
	const args = await ArgParser.commandFrom(["chapter", "new", "--title=T", "d.md"], nested)
		.resolve();
	assertEquals(args.command, "chapter new");
	assertEquals(args.commandPath, ["chapter", "new"]);
	if (args.command === "chapter new") {
		assertEquals(args.title, "T");
		assertEquals(args.draft, "d.md");
	}
});

Deno.test("a root flag is accepted after the command", async () => {
	const args = await ArgParser.commandFrom(["chapter", "list", "--json"], nested).resolve();
	assertEquals(args.command, "chapter list");
	assertEquals(args.json, true);
});

Deno.test("a group's own flag is accepted at either level", async () => {
	const before = await ArgParser.commandFrom(["chapter", "-v", "list"], nested).resolve();
	const after = await ArgParser.commandFrom(["chapter", "list", "-v"], nested).resolve();
	assertEquals(before.command, "chapter list");
	if (before.command === "chapter list") assertEquals(before.verbose, true);
	if (after.command === "chapter list") assertEquals(after.verbose, true);
});

Deno.test("an unknown subcommand names its parent and suggests a near match", async () => {
	const error = await assertRejects(
		() => ArgParser.commandFrom(["chapter", "lst"], nested).resolve(),
		Error,
	);
	assertStringIncludes(error.message, `Unknown command "lst" for chapter`);
	assertStringIncludes(error.message, "list, new");
	assertStringIncludes(error.message, `Did you mean "list"?`);
});

Deno.test("a group requires one of its subcommands", async () => {
	const error = await assertRejects(
		() => ArgParser.commandFrom(["chapter"], nested).resolve(),
		Error,
	);
	assertStringIncludes(error.message, "Missing command for chapter");
});

Deno.test("help for a group lists its subcommands", () => {
	const help = ArgParser.commandFrom(["chapter"], nested).setProgram("tmstn").helpText();
	assertStringIncludes(help, "Subcommands of chapter:");
	assertStringIncludes(help, "list");
	assertStringIncludes(help, "List chapters");
});

Deno.test("help for a leaf includes its ancestors' and the root's options", () => {
	const help = ArgParser.commandFrom(["chapter", "list"], nested).setProgram("tmstn").helpText();
	assertStringIncludes(help, "tmstn chapter list");
	assertStringIncludes(help, "--verbose");
	assertStringIncludes(help, "--json");
});

Deno.test("--non-interactive after the command still turns prompting off", async () => {
	// It is declared in `$root`, so routing has to send it to the root parser wherever it lands.
	const error = await assertRejects(
		() =>
			ArgParser.commandFrom(["chapter", "new", "--non-interactive"], {
				$root: { nonInteractive: { type: "flag" } },
				$requireCommand: true,
				chapter: {
					$commands: {
						new: { title: { type: "string", required: true, prompt: "Title" } },
					},
				},
			}).resolve(),
		Error,
	);
	assertStringIncludes(error.message, "Missing required arguments");
	assertStringIncludes(error.message, "--title");
});

// ─── Help without exiting ─────────────────────────────────────────────────────

Deno.test("help mode throw carries the text instead of exiting", async () => {
	const parser = new ArgParser(["--help"], { port: { type: "number" } }).setHelpMode("throw");
	const error = await assertRejects(() => parser.resolve(), HelpRequested);
	assertStringIncludes(error.helpText, "--port");
});

Deno.test("a command parser throws help for the matched command", async () => {
	const parser = ArgParser.commandFrom(["chapter", "list", "--help"], nested)
		.setProgram("tmstn")
		.setHelpMode("throw");
	const error = await assertRejects(() => parser.resolve(), HelpRequested);
	assertStringIncludes(error.helpText, "tmstn chapter list");
});

Deno.test("help wins over a malformed command line", async () => {
	// Otherwise the one thing that explains the right spelling is unreachable the moment you
	// spell something wrong.
	const parser = new ArgParser(["--nonsense", "--help"], { port: { type: "number" } })
		.setHelpMode("throw");
	await assertRejects(() => parser.resolve(), HelpRequested);
});

// ─── promptFor ────────────────────────────────────────────────────────────────

Deno.test("promptFor asks for one arg with the parser's own semantics", async () => {
	const out = new BufferWriter(80, 24);
	const keys = new FakeKeyReader();
	using session = startCliSession({ writer: out, reader: keys, interrupt: "event" });

	const answer = promptFor({ type: "string", prompt: "New title" }, { session });
	await settled();
	keys.type("Chapter Two");
	keys.press("enter");

	assertEquals(await answer, "Chapter Two");
	assertStringIncludes(out.line(0), "New title");
});

Deno.test("promptFor re-asks until the schema is satisfied", async () => {
	const { f } = await import("@bearmetal/forge");
	const out = new BufferWriter(80, 24);
	const keys = new FakeKeyReader();
	using session = startCliSession({ writer: out, reader: keys, interrupt: "event" });

	const answer = promptFor(
		{ type: "string", prompt: "Slug", schema: f.string().min(3) },
		{ session },
	);
	await settled();
	keys.type("ab");
	keys.press("enter");
	await settled();
	keys.type("abc");
	keys.press("enter");

	// Each retry is a fresh prompt rather than the rejected text pre-filled — a pre-filled
	// invalid value that Enter re-submits is a loop with no way out.
	assertEquals(await answer, "abc");
});

Deno.test("promptFor on an enum offers a menu and returns the value", async () => {
	const keys = new FakeKeyReader();
	using session = startCliSession({
		writer: new BufferWriter(80, 24),
		reader: keys,
		interrupt: "event",
	});

	const answer = promptFor({ type: "enum", values: ["postgres", "kv"], prompt: "DB" }, { session });
	await settled();
	keys.press("down");
	keys.press("enter");

	assertEquals(await answer, "kv");
});

Deno.test("promptFor returns defaults for the types that never prompt", async () => {
	assertEquals(await promptFor({ type: "flag", default: true }), true);
	assertEquals(await promptFor({ type: "list", default: ["a"] }), ["a"]);
});

// ─── canPrompt ────────────────────────────────────────────────────────────────

Deno.test("canPrompt follows the session's mode", () => {
	const interactive = startCliSession({
		writer: new BufferWriter(80, 24),
		reader: new FakeKeyReader(),
	});
	assertEquals(canPrompt(), true);
	interactive.cleanup();

	const piped = startCliSession({
		writer: new BufferWriter(80, 24, { isTTY: false }),
		reader: new FakeKeyReader(),
	});
	assertEquals(piped.mode, "plain");
	assertEquals(canPrompt(), false);
	piped.cleanup();
});
