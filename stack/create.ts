import { bootstrap } from "./bootstrap.ts";
import { coalesceFlags, type flags } from "./flags.ts";

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

bootstrap({
	flags,
	projectName,
	dirname,
});

console.log(`\n✅ Project "${projectName}" has been created`);
console.log(
	`To get started: ${projectName === "." ? "" : `cd ${projectName} && `}deno task bm:dev`,
);
