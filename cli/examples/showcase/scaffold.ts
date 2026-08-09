/**
 * Prompting you do not write.
 *
 * `ArgParser.resolve()` fills in anything `required` that the command line did not
 * supply: a `string` becomes a text prompt, an `enum` becomes a select menu, a
 * `confirm` becomes a y/n. The same defs are the `--help` output and the
 * non-interactive validation, so there is exactly one description of the
 * interface.
 * @module
 */

import { type ArgDefsShape, type CliSession, colorize } from "@bearmetal/cli";
import { f } from "@bearmetal/forge";

/** Arg definitions for the `scaffold` command. */
export const scaffoldDefs = {
	$description: "Let the arg parser ask the questions",
	name: {
		type: "string",
		prompt: "Project name",
		required: true,
		default: "my-app",
		// Forge validates the typed answer too, and re-prompts on failure rather
		// than throwing the whole run away.
		schema: f.string().regex(/^[a-z][a-z0-9-]*$/, "lowercase letters, digits and dashes only"),
		$description: "Name of the project to create",
	},
	db: {
		type: "enum",
		values: ["postgres", "kv", "none"] as const,
		prompt: "Which database?",
		required: [
			true,
			// Conditions are evaluated against the resolved values, so this reads the
			// answer to `auth` no matter which order the two were collected in.
			{ if: "auth", message: "auth needs somewhere to store users", cannotBe: ["none"] },
		],
		$description: "Database provider",
	},
	auth: {
		type: "confirm",
		prompt: "Include authentication?",
		required: true,
		default: false,
		$description: "Scaffold @bearmetal/auth",
	},
	dryRun: {
		type: "flag",
		default: false,
		$description: "Print the plan without writing anything",
	},
} satisfies ArgDefsShape;

/** Everything `scaffold` needs, after resolution. */
export interface ScaffoldArgs {
	name?: string;
	db?: string;
	auth: boolean;
	dryRun: boolean;
}

/** Reports what the resolved answers add up to. */
export function runScaffold(session: CliSession, args: ScaffoldArgs): number {
	const rows: [string, string][] = [
		["name", args.name ?? "(unset)"],
		["database", args.db ?? "(unset)"],
		["auth", args.auth ? "yes" : "no"],
	];

	session.log("");
	session.log(colorize("Resolved", "porple"));
	for (const [key, value] of rows) {
		session.log(`  ${colorize(key.padEnd(10), "gray")}${value}`);
	}

	if (args.dryRun) {
		session.log(colorize("\n--dry-run: nothing written.", "gray"));
	}
	return 0;
}
