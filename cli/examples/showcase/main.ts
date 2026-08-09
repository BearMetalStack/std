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
 * deno run main.ts --alt keys
 * deno run main.ts --non-interactive scaffold --name=demo --db=kv
 * ```
 * @module
 */

import {
	type ArgDefsShape,
	ArgParser,
	colorize,
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
	$description: "Global options (these go before the command name)",
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
 * `$root` args are the ones *before* the command token, so the same slice
 * `CommandArgParser` takes is the slice to read here — otherwise `--alt` would
 * appear to work after the command name in one place and not the other.
 */
function bootstrapMode(argv: string[]): InteractiveMode {
	const at = argv.findIndex((arg) => !arg.startsWith("-"));
	const rootArgs = at === -1 ? argv : argv.slice(0, at);
	return ArgParser.from(rootArgs, globalDefs).get("alt") ? "alt" : "inline";
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

	keys: {
		$description: "A custom widget: decoded key events, live",
	},

	palette: {
		$description: "Colours, attributes and width measurement (works without a terminal)",
	},
}).setProgram(PROGRAM);

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
			promptForCommand: session.mode !== "plain" && "What would you like to see?",
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
			case "keys":
				return await runKeyInspector(session);
			case "palette":
				return printPalette(session);
			default:
				session.log(parser.helpText(PROGRAM));
				return 0;
		}
	} catch (error) {
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
// exiting out here is what guarantees the terminal is restored first.
//
// (The session also registers an `unload` hook, so the one place that *does* exit
// from inside — `--help` — still restores. Belt and braces; don't rely on it.)
if (import.meta.main) Deno.exit(await main(Deno.args));
