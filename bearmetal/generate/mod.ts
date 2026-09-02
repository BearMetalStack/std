/**
 * The `generate` command group.
 *
 * `generate` is a container for scaffolding subcommands; `generate route` is the
 * first. New generators (schemas, components, modules) slot in alongside it
 * under `$commands` without touching the CLI's top level.
 *
 * @module
 */

import type { ArgDefsShape } from "@bearmetal/cli/types";
import type { Resolved } from "../run.ts";
import { routeCommand } from "./route/command.ts";
import { generateRoute } from "./route/generate.ts";

export { expandBundledMethodFlags } from "./route/command.ts";

/** Argument definitions for the `generate` command and its subcommands. */
export const generateCommand = {
	$description: "Scaffold BearMetal source files",
	$commands: {
		route: routeCommand,
	},
} satisfies ArgDefsShape;

/** Dispatches a resolved `generate route` invocation. */
export async function runGenerate(
	resolved: Resolved & { command: "generate route" },
): Promise<void> {
	await generateRoute(resolved);
}
