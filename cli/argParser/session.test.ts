import { assertEquals, assertRejects } from "@std/assert";
import { ArgParser } from "./mod.ts";
import { BufferWriter, FakeKeyReader } from "../testing.ts";
import { startCliSession } from "../render/mod.ts";
import { setColorEnabled } from "../style.ts";

setColorEnabled(false);

const settled = () => new Promise<void>((r) => setTimeout(r, 0));

Deno.test("a parser prompts inside an ambient session and leaves a clean transcript", async () => {
	const out = new BufferWriter(80, 24);
	const keys = new FakeKeyReader();
	using _session = startCliSession({ writer: out, reader: keys, interrupt: "event" });

	const parser = new ArgParser([], {
		projectName: { type: "string", required: true, prompt: "Project name" },
		db: { type: "enum", values: ["postgres", "kv"], required: true, prompt: "Database" },
	});

	const resolved = parser.resolve();

	await settled();
	keys.type("my-app");
	keys.press("enter");

	await settled();
	keys.press("down");
	keys.press("enter");

	const args = await resolved;
	assertEquals(args.projectName, "my-app");
	assertEquals(args.db, "kv");

	const lines = out.lines();
	assertEquals(lines.length, 2);
	assertEquals(lines[0].includes("my-app"), true);
	assertEquals(lines[1].includes("kv"), true);
});

Deno.test("output printed between prompts stays in the transcript", async () => {
	const out = new BufferWriter(80, 24);
	const keys = new FakeKeyReader();
	using _session = startCliSession({ writer: out, reader: keys, interrupt: "event" });

	out.write("=== banner ===\r\n");

	const parser = new ArgParser([], {
		name: { type: "string", required: true, prompt: "Name" },
	});
	const resolved = parser.resolve();
	await settled();
	keys.type("x");
	keys.press("enter");
	await resolved;

	assertEquals(out.lines()[0], "=== banner ===");
});

Deno.test("values given on the command line are not prompted for", async () => {
	const out = new BufferWriter(80, 24);
	const keys = new FakeKeyReader();
	using _session = startCliSession({ writer: out, reader: keys, interrupt: "event" });

	const parser = new ArgParser(["--name=given"], {
		name: { type: "string", required: true, prompt: "Name" },
	});

	assertEquals((await parser.resolve()).name, "given");
	assertEquals(out.lines(), []);
});

Deno.test("--non-interactive turns prompting off under either spelling", () => {
	const defs = { nonInteractive: { type: "flag" } } as const;

	assertEquals(new ArgParser(["--nonInteractive"], defs)._interactive, false);
	assertEquals(new ArgParser(["--non-interactive"], defs)._interactive, false);
	assertEquals(
		new ArgParser(["-n"], { nonInteractive: { type: "flag", aliases: ["-n"] } })
			._interactive,
		false,
	);
	assertEquals(new ArgParser([], defs)._interactive, true);
});

Deno.test("a required confirm is satisfied by an explicit no", async () => {
	const defs = {
		nonInteractive: { type: "flag" },
		auth: { type: "confirm", required: true, prompt: "Auth" },
	} as const;

	const answered = await new ArgParser(["--non-interactive", "--no-auth"], defs).resolve();
	assertEquals(answered.auth, false);

	const yes = await new ArgParser(["--non-interactive", "--auth"], defs).resolve();
	assertEquals(yes.auth, true);

	await assertRejects(
		() => new ArgParser(["--non-interactive"], defs).resolve(),
		Error,
		"--auth",
	);
});

Deno.test("setInteractiveMode is chainable and records the mode", () => {
	const parser = new ArgParser([], {}).setInteractiveMode("alt");
	assertEquals(parser._mode, "alt");
	assertEquals(parser instanceof ArgParser, true);
});
