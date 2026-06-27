import { ArgParser, colorize, renderTitleAscii } from "@bearmetal/cli";
import { longestLine, random, sets } from "@bearmetal/miscellanea";

import { bootstrap } from "./bootstrap.ts";
import type { flags } from "./flags.ts";

const { columns } = Deno.consoleSize();
const m = Temporal.Now.plainDateISO().month;
const set = (m === 10 ? sets.spooky : sets.def).filter((e) => longestLine(e) < columns);
renderTitleAscii(random(...set), { pride: m === 6, maxWidth: columns });

const parser = ArgParser.from(Deno.args, {
	dryRun: {
		type: "flag",
	},
	projectName: {
		type: "string",
		prompt: "Project name",
		required: true,
		default: ".",
	},
	auth: {
		type: "confirm",
		prompt: "Would you like to use authentication?",
		required: true,
	},
	db: {
		type: "enum",
		values: ["postgres", "none"] as const,
		prompt: "Which DB provider would you like to use?",
		required: [{ if: "auth", message: "required for authentication", cannotBe: ["none"] }, true],
	},
});

const args = await parser.resolve();

const rawName = args.projectName ?? ".";
const dirname = rawName;
const projectName = rawName === "." ? (Deno.cwd().split("/").pop() ?? "app") : rawName;

const flags: flags = {
	auth: args.auth,
	db: args.db === "postgres" ? "postgres" : false,
	devProxy: false,
	miscellanea: false,
};

if (!args.dryRun) {
	await bootstrap({ flags, projectName, dirname, dryRun: false });
}

console.log(colorize(`\n🗸 Project "${projectName}" has been created`, "green"));
console.log(
	`To get started: ${
		dirname === "." ? "" : `cd ${projectName} && `
	}deno install && deno task bm:dev`,
);
