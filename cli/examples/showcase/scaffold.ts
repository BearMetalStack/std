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

import { type ArgDefsShape, type CliSession, colorize, definitionList } from "@bearmetal/cli";
import { f } from "@bearmetal/forge";

/** Arg definitions for the `scaffold` command. */
export const scaffoldDefs = {
	$description: "Let the arg parser ask the questions",
	// A positional is an ordinary entry, keyed by its name. Declaring it is what puts it in the
	// usage line and makes a surplus argument an error instead of something silently ignored.
	directory: {
		type: "positional",
		$description: "Where to create it (defaults to the project name)",
	},
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
	directory?: string;
}

/** Reports what the resolved answers add up to. */
export function runScaffold(session: CliSession, args: ScaffoldArgs): number {
	session.log("");
	session.log(colorize("Resolved", "porple"));
	// `definitionList` measures with `displayWidth`, so a coloured or wide-character key still
	// lines up. `padEnd` on a styled string does not.
	session.log(definitionList([
		["name", args.name ?? "(unset)"],
		["database", args.db ?? "(unset)"],
		["auth", args.auth ? "yes" : "no"],
		["directory", args.directory ?? args.name ?? "."],
	], { indent: 2, width: session.out.columns }));

	if (args.dryRun) {
		session.log(colorize("\n--dry-run: nothing written.", "gray"));
	}
	return 0;
}
