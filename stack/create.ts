/**
 * `deno create jsr:@bearmetal/stack` — the setup wizard.
 *
 * Every question is also a flag, and the flags are the same definitions the
 * wizard prompts from, so `--help`, the prompts and the non-interactive
 * contract cannot drift apart.
 *
 * @module
 */

import {
	ArgParser,
	colorize,
	HelpRequested,
	renderTitleAscii,
	startCliSession,
} from "@bearmetal/cli";
import type { ArgDefsShape } from "@bearmetal/cli/types";
import { longestLine, random, sets } from "@bearmetal/miscellanea";

import { bootstrap } from "./bootstrap.ts";
import type { flags } from "./flags.ts";
import { templateNames } from "./template.ts";

/** Directory name a scaffolded project falls back to when nothing was given. */
const FALLBACK_NAME = "app";

/** Last path segment of `path`, which is the app's name when a path was given. */
function basename(path: string): string {
	return path.split("/").filter(Boolean).pop() ?? FALLBACK_NAME;
}

const defs = {
	$description: "Create a new BearMetal app.",

	name: {
		type: "string",
		aliases: ["--project-name"],
		prompt: "Project name",
		$description: "Name of the app, and the directory it is created in",
		// `--here` answers this question by taking the current directory's name,
		// so it is only worth asking when `--here` was not given.
		required: [{ ifNot: "here", message: "pass --name=<app> or --here" }],
	},
	here: {
		type: "flag",
		$description: "Create the app in the current directory, which must be empty",
	},
	template: {
		type: "enum",
		values: templateNames,
		default: "default",
		$description: "Template to scaffold from",
	},
	default: {
		type: "flag",
		$description: "Take every default and ask nothing beyond the name",
	},

	auth: {
		type: "confirm",
		prompt: "Would you like to use authentication?",
		$description: "Include the auth module",
		required: [{ ifNot: "default" }],
	},
	db: {
		type: "enum",
		values: ["postgres", "none"] as const,
		aliases: ["--use-db"],
		default: "none",
		prompt: "Which DB provider would you like to use?",
		$description: "Include a database connector",
		required: [
			{ ifNot: "default" },
			{ if: "auth", message: "auth needs somewhere to keep users", cannotBe: ["none"] },
		],
	},
	devProxy: {
		type: "string",
		$description: "Host to serve the app under in development, e.g. dev.example.com",
	},

	dryRun: {
		type: "flag",
		$description: "Print what would be written without writing it",
	},
	nonInteractive: {
		type: "flag",
		aliases: ["-n"],
		$description: "Never prompt; missing required args become an error",
	},
	// `satisfies` rather than `as const`: it keeps the string literals narrow
	// enough for the parser to infer each arg's resolved type, while leaving the
	// `required` arrays mutable, which `as const` would not.
} satisfies ArgDefsShape;

/**
 * The banner, when there is a terminal to draw it on.
 *
 * `Deno.consoleSize()` *throws* when stdout is redirected, which is how
 * `deno create … --help | less` used to fail before it had parsed a single
 * argument. Piped output gets no ASCII art and no crash.
 */
function banner(): void {
	if (!Deno.stdout.isTerminal()) return;
	const { columns } = Deno.consoleSize();
	const month = Temporal.Now.plainDateISO().month;
	const set = (month === 10 ? sets.spooky : sets.def).filter((e) => longestLine(e) < columns);
	renderTitleAscii(random(...set), { pride: month === 6, maxWidth: columns });
}

async function main(): Promise<number> {
	banner();

	using session = startCliSession();

	const parser = ArgParser.from(Deno.args, defs)
		.setRootCommand("deno create jsr:@bearmetal/stack")
		// `--help` must not `Deno.exit` from inside a session: disposal would be
		// skipped and the terminal left in raw mode.
		.setHelpMode("throw");

	let args;
	try {
		args = await parser.resolve();
	} catch (error) {
		if (error instanceof HelpRequested) {
			session.log(error.helpText);
			return 0;
		}
		session.log(colorize(String(error instanceof Error ? error.message : error), "red"));
		return 1;
	}

	const here = args.here === true;
	const cwdName = basename(Deno.cwd());
	// `--name` doubles as the directory to create, so it may well be a path. The
	// app is named after its last segment either way.
	const target = here ? "." : (args.name ?? FALLBACK_NAME);
	const projectName = here ? cwdName : basename(target);

	const flags: flags = {
		auth: args.auth === true,
		db: args.db === "postgres" ? "postgres" : false,
		devProxy: args.devProxy ? args.devProxy : false,
		miscellanea: false,
	};

	await bootstrap({
		flags,
		projectName,
		dirname: target,
		dryRun: args.dryRun === true,
		template: args.template ?? "default",
	});

	session.log(colorize(`\n🗸 Project "${projectName}" has been created`, "green"));
	session.log(
		`To get started: ${here ? "" : `cd ${target} && `}deno install && deno task bm:dev`,
	);
	return 0;
}

Deno.exit(await main());
