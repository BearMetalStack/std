import { renderTitleAscii } from "@bearmetal/cli";
import { longestLine, random, sets } from "@bearmetal/miscellanea";

import { bootstrap } from "./bootstrap.ts";
import { coalesceFlags, type flags } from "./flags.ts";

const { columns } = Deno.consoleSize();
const m = Temporal.Now.plainDateISO().month;
const set = (m === 10 ? sets.spooky : sets.def).filter((e) => longestLine(e) < columns);
renderTitleAscii(random(...set), { pride: m === 6, maxWidth: columns });

const flags: flags = {
	db: false,
	devProxy: false,
	miscellanea: false,
	auth: false,
};

const currentDirName = Deno.cwd().split("/").pop()!;

let projectName = prompt(`Project name: `, ".") ?? ".";
const dirname = projectName;
if (projectName === ".") projectName = currentDirName;

coalesceFlags(flags);

await bootstrap({
	flags,
	projectName,
	dirname,
});

console.log(`\n✅ Project "${projectName}" has been created`);
console.log(
	`To get started: ${
		dirname === "." ? "" : `cd ${projectName} && `
	}deno install && deno task bm:dev`,
);
