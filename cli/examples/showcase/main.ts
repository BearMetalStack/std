/**
 * A worked example of `@bearmetal/cli`, end to end.
 *
 * The shape here is the one every BearMetal CLI should copy:
 *
 * 1. Parse the global flags that decide *how* the run is presented, before
 *    anything is drawn.
 * 2. Open exactly one {@linkcode startCliSession} for the whole program, so arg
 *    resolution, prompts, menus and progress output share one terminal state and
 *    one restore.
 * 3. Dispatch. Never call `Deno.exit` from inside the session — return an exit
 *    code and let `using` put the terminal back on the way out.
 *
 * Run it:
 *
 * ```sh
 * deno task start            # command picker
 * deno run main.ts --help
 * deno run main.ts wizard
 * deno run main.ts show keys --alt
 * deno run main.ts scaffold --name=demo --db=kv --no-auth --non-interactive
 * ```
 * @module
 */

import {
	type ArgDefsShape,
	ArgParseError,
	ArgParser,
	canPrompt,
	colorize,
	HelpRequested,
	type InteractiveMode,
	NotInteractiveError,
	startCliSession,
	WidgetCancelledError,
} from "@bearmetal/cli";

import { runKeyInspector } from "./keys.ts";
import { printPalette } from "./palette.ts";
import { runProgress } from "./progress.ts";
import { runScaffold, scaffoldDefs } from "./scaffold.ts";
import { runWizard } from "./wizard.ts";

const PROGRAM = "showcase";

/**
 * Flags that apply to the whole program rather than to one command.
 *
 * Declared once and used twice: as `$root` below, and by the bootstrap parse that
 * has to know the presentation mode before a session can be opened.
 */
const globalDefs = {
	$description: "Global options (accepted anywhere on the command line)",
	alt: {
		type: "flag",
		aliases: ["-a"],
		default: false,
		$description: "Run the whole session on the alternate screen",
	},
	/**
	 * `nonInteractive` is a reserved name: `ArgParser` looks for this exact key and
	 * switches to its non-prompting path when the flag is present, under either
	 * spelling (`--nonInteractive`, `--non-interactive`) or any alias. Aliases are
	 * matched verbatim against argv for that check, so they need their dashes.
	 */
	nonInteractive: {
		type: "flag",
		aliases: ["-n"],
		default: false,
		$description: "Never prompt; missing required args become an error",
	},
} satisfies ArgDefsShape;

/**
 * Reads the global flags without resolving anything.
 *
 * `$root` flags are accepted anywhere on the command line, so this reads the whole argv — the
 * same tokens the command parser will route back to the root itself.
 */
function bootstrapMode(argv: string[]): InteractiveMode {
	return ArgParser.from(argv, globalDefs).get("alt") ? "alt" : "inline";
}

const parser = ArgParser.commandFrom(Deno.args, {
	$description: "A tour of @bearmetal/cli: prompts, menus, regions, widgets and styling.",
	$root: globalDefs,

	scaffold: scaffoldDefs,

	wizard: {
		$description: "The same questions asked by hand, with filters and validation",
		dryRun: {
			type: "flag",
			default: false,
			$description: "Print the plan without pretending to build anything",
		},
	},

	progress: {
		$description: "A live region that survives ordinary output printed alongside it",
		steps: {
			type: "number",
			default: 6,
			$description: "How many fake steps to run",
		},
	},

	// A group: `showcase show keys`, `showcase show palette`. Nesting is declared, not encoded
	// into the token stream by the caller.
	show: {
		$description: "Things to look at",
		$commands: {
			keys: { $description: "A custom widget: decoded key events, live" },
			palette: {
				$description: "Colours, attributes and width measurement (works without a terminal)",
			},
		},
	},
}).setProgram(PROGRAM)
	// Throwing beats exiting: `main` owns the session, so it has to be the one to decide when
	// the process ends.
	.setHelpMode("throw");

async function main(argv: string[]): Promise<number> {
	// One session for the whole run. `mode` is honoured only when stdout is a
	// terminal; piped output silently becomes "plain" and every widget adapts.
	using session = startCliSession({
		mode: bootstrapMode(argv),
		captureConsole: true,
	});

	try {
		// The ambient session is picked up automatically — the parser prompts into
		// ours instead of opening one of its own.
		const args = await parser.resolve({
			// `canPrompt()` is the check — no need to thread an `interactive` boolean around.
			promptForCommand: canPrompt() && "What would you like to see?",
		});

		switch (args.command) {
			case "scaffold":
				return await runScaffold(session, args);
			case "wizard":
				return await runWizard(session, { dryRun: args.dryRun });
			case "progress":
				return await runProgress(
					session,
					Array.from({ length: args.steps ?? 6 }, (_, i) => `Step ${i + 1}`),
				);
			case "show keys":
				return await runKeyInspector(session);
			case "show palette":
				return printPalette(session);
			default:
				session.log(parser.helpText(PROGRAM));
				return 0;
		}
	} catch (error) {
		// `--help`, now that the parser hands it back instead of exiting from inside the session.
		if (error instanceof HelpRequested) {
			session.log(error.helpText);
			return 0;
		}

		// A malformed command line. Every problem at once, then the way out.
		if (error instanceof ArgParseError) {
			for (const issue of error.issues) session.log(colorize(`✗ ${issue}`, "red"));
			session.log(colorize(`\nRun \`${PROGRAM} --help\` for usage.`, "gray"));
			return 2;
		}

		// A widget whose session was torn down mid-question. Not an error worth a
		// stack trace — the user pressed Ctrl+C, or something else asked us to stop.
		if (error instanceof WidgetCancelledError) return 130;

		if (error instanceof NotInteractiveError) {
			session.log(colorize(`${error.message}. Pass --non-interactive with explicit flags.`, "red"));
			return 1;
		}

		session.log(colorize(error instanceof Error ? error.message : String(error), "red"));
		return 1;
	}
}

// `Deno.exit` inside the `using` block would skip disposal. Returning the code and
// exiting out here is what guarantees the terminal is restored first — which is also why the
// parser is set to throw for `--help` rather than exit from inside `resolve()`.
if (import.meta.main) Deno.exit(await main(Deno.args));
