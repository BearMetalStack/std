/**
 * Prompting by hand.
 *
 * Everything here would normally be left to `ArgParser.resolve()`. It is spelled
 * out to show what the widgets actually offer: rejecting a keystroke before it
 * lands, re-asking on a bad answer, and telling "the user chose nothing" apart
 * from "the user pressed Escape".
 * @module
 */

import {
	cliConfirm,
	cliPrompt,
	type CliSession,
	colorize,
	multiSelectMenuInteractive,
	selectMenuInteractive,
} from "@bearmetal/cli";

import { runProgress } from "./progress.ts";

/** Characters allowed in a project name. */
const SLUG_CHAR = /[a-z0-9-]/;

const EXTRAS = ["auth", "sockpuppet", "drip", "devproxy", "webbies"];

/** Asks the scaffolding questions one at a time. */
export async function runWizard(
	session: CliSession,
	opts: { dryRun: boolean },
): Promise<number> {
	// Menus have no non-interactive fallback to offer, so check once, up front,
	// rather than letting `NotInteractiveError` escape from question three.
	if (session.mode === "plain") {
		session.log(
			colorize("The wizard needs a terminal. Try `showcase --non-interactive scaffold`.", "red"),
		);
		return 1;
	}

	const name = await cliPrompt(`${colorize("?", "porple")} Project name`, {
		default: "my-app",
		// A filter rejects the character before it reaches the buffer. This is the
		// supported way to constrain input — not a second key listener racing the
		// prompt's own.
		filter: (char) => SLUG_CHAR.test(char),
		// A validator runs on Enter. Returning a message re-asks with the message
		// shown underneath; returning null accepts.
		validate: (value) => value.length >= 2 ? null : "At least two characters, please",
	});

	// Menus colour the question themselves, so hand them plain text — nesting one
	// colour inside another ends both at the inner reset.
	//
	// `null` means dismissed with Escape. It is not the same as an empty choice,
	// which is what the multi-select returns for "none of them".
	const db = await selectMenuInteractive("Which database?", [
		["Postgres", "postgres"],
		["Deno KV", "kv"],
		["None", "none"],
	]);
	if (db === null) return cancel(session);

	const extras = await multiSelectMenuInteractive(
		"Extra packages",
		EXTRAS,
		// Adds a "Select All" row that stays checked only while everything else is.
		{ allOption: true, initialSelections: [] },
	);
	if (extras === null) return cancel(session);

	const install = await cliConfirm("Install dependencies now?", true);

	// Between widgets, ordinary output is ordinary output — the previous questions
	// have already collapsed to their summary lines.
	session.log("");
	session.log(colorize("Plan", "porple"));
	session.log(`  ${colorize("project".padEnd(10), "gray")}${name}`);
	session.log(`  ${colorize("database".padEnd(10), "gray")}${db}`);
	session.log(
		`  ${colorize("extras".padEnd(10), "gray")}${extras.length ? extras.join(", ") : "—"}`,
	);
	session.log("");

	if (opts.dryRun) {
		session.log(colorize("--dry-run: nothing built.", "gray"));
		return 0;
	}

	const steps = [
		`Creating ${name}/`,
		"Writing deno.json",
		...extras.map((extra) => `Adding @bearmetal/${extra}`),
		...(install ? ["Installing dependencies"] : []),
	];
	return await runProgress(session, steps);
}

function cancel(session: CliSession): number {
	session.log(colorize("Cancelled.", "gray"));
	return 1;
}
