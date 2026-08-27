/**
 * The orchestrator: gather the request (from flags, or interactively), read the
 * project's current routes tree, plan the changes and apply them.
 *
 * @module
 */

import { canPrompt, cliLog, colorize } from "@bearmetal/cli";
import { joinPath } from "@bearmetal/miscellanea";
import { readTextIfPresent } from "@bearmetal/miscellanea/fs";
import type { GenerateContext, RouteRequest } from "./types.ts";
import { validatePath } from "./path.ts";
import { partialRequestFromArgs, type RouteArgs } from "./command.ts";
import { runWizard } from "./wizard.ts";
import { loadTree } from "./tree.ts";
import { applyPlan, type EntryFile, planRoute } from "./plan.ts";
import { findModuleVar } from "./source.ts";

/** Entry files the generator will consider wiring a top-level route into. */
const ENTRY_CANDIDATES = ["main.ts", "server.ts", "app.ts", "mod.ts"];

/** Runs the whole `generate route` flow for the given resolved args. */
export async function generateRoute(args: RouteArgs): Promise<void> {
	const projectRoot = resolveRoot(args.root);
	const routesDirName = args.routesDir || "routes";
	const routesDir = joinPath(projectRoot, routesDirName);

	const interactive = canPrompt() && !args.nonInteractive;
	const partial = partialRequestFromArgs(args);
	const useWizard = interactive && (!partial.path || partial.methods.length === 0);

	let request: RouteRequest;
	if (useWizard) {
		request = await runWizard(partial);
	} else {
		if (!partial.path) {
			throw new Error("A route path is required. Pass --path=/your/route.");
		}
		if (partial.methods.length === 0) {
			throw new Error(
				"At least one method is required. Pass -R/--get, -C/--post, -U/--put, " +
					"-P/--patch, -D/--delete or -O/--options (or bundle them: -CRUD).",
			);
		}
		request = {
			path: validatePath(partial.path),
			methods: partial.methods,
			bodySchema: partial.bodySchema,
			responseSchemas: partial.responseSchemas,
			shorthand: partial.shorthand,
			filename: partial.filename,
		};
	}

	const ctx: GenerateContext = {
		projectRoot,
		routesDir,
		routesDirName,
		dryRun: args.dryRun,
		wire: args.wire,
		log: (message) => cliLog(message),
	};

	cliLog(
		colorize(
			`Generating ${request.path} [${request.methods.map((m) => m.toUpperCase()).join(", ")}]` +
				(ctx.dryRun ? " (dry run)" : ""),
			"porple",
		),
	);

	const tree = await loadTree(routesDir);
	const entry = await findEntryFile(projectRoot);
	const plan = planRoute(tree, request, ctx, entry);

	if (plan.ops.length === 0) {
		cliLog(colorize("Nothing to do — the route already exists as requested.", "gray"));
		for (const warning of plan.warnings) cliLog(`! ${warning}`);
		return;
	}

	await applyPlan(plan, ctx);

	if (!ctx.dryRun) {
		cliLog(colorize(`\n\u{1F5F8} Route ${request.path} generated.`, "green"));
	}
}

/** Resolves the project root to an absolute path. */
function resolveRoot(root: string | undefined): string {
	if (!root) return Deno.cwd();
	return root.startsWith("/") ? root : joinPath(Deno.cwd(), root);
}

/** Finds the app entry file to wire a new top-level route into, if any. */
async function findEntryFile(projectRoot: string): Promise<EntryFile | null> {
	let fallback: EntryFile | null = null;
	for (const name of ENTRY_CANDIDATES) {
		const path = joinPath(projectRoot, name);
		const contents = await readTextIfPresent(path);
		if (contents === undefined) continue;
		if (findModuleVar(contents)) return { path, contents };
		fallback ??= { path, contents };
	}
	return fallback;
}
