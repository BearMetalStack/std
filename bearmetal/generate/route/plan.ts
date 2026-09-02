/**
 * Turns a {@link RouteRequest} and the current routes tree into a concrete list
 * of file operations, without performing any of them. Keeping planning pure
 * makes it testable and makes `--dry-run` a printout of exactly what `apply`
 * would do.
 *
 * The shape of the plan:
 * - Walk the requested path segment by segment.
 * - Every segment but the last is an *ancestor* and must be a parent (a
 *   directory with a `mod.ts`). An existing leaf is promoted — moved into a
 *   directory as `mod.ts`, its relative imports rewritten — rather than
 *   clobbered.
 * - Each ancestor mounts its child with `router.use("<ownPath>", child())`.
 * - The last segment is the *target*: a new leaf file is written whole, an
 *   existing one has the requested methods spliced onto its chain.
 * - A brand-new top-level module is wired into the app entry file.
 *
 * @module
 */

import { joinPath } from "@bearmetal/miscellanea";
import { ensureDirOf } from "@bearmetal/miscellanea/fs";
import type { GenerateContext, Method, RouteRequest, SchemaRef } from "./types.ts";
import { BODY_METHODS } from "./types.ts";
import { moduleFnName, relativeSpecifier, segmentToFileName, splitSegments } from "./path.ts";
import type { RouteNode } from "./tree.ts";
import {
	addImport,
	chainHasMethod,
	chainHasResponds,
	findModuleVar,
	findRouteChain,
	findShorthand,
	hasMount,
	importsName,
	insertBeforeChainEnd,
	insertBeforeReturn,
	insertBeforeServe,
	rewriteRelativeImports,
	sortNames,
	updateImportSpecifier,
} from "./source.ts";
import {
	bodyMethodsOf,
	indentLines,
	methodPiece,
	nodeRoutePath,
	primaryMethod,
	renderModuleFile,
	renderMount,
	renderRouteChain,
	renderShorthand,
	respondsPiece,
	ROUTER_SPECIFIER,
} from "./render.ts";

// ─── Plan shape ─────────────────────────────────────────────────────────────

/** A single file mutation. */
export type FileOp =
	| { kind: "write"; path: string; contents: string; existed: boolean }
	| { kind: "remove"; path: string };

export interface Plan {
	ops: FileOp[];
	warnings: string[];
}

/** The app entry file, read for wiring. */
export interface EntryFile {
	path: string;
	contents: string;
}

// ─── Planned node ───────────────────────────────────────────────────────────

interface PlannedNode {
	segment: string;
	/** The route path this node declares for itself, e.g. `"/api"`. */
	ownPath: string;
	/** The full path from the app root, e.g. `"/api/users"`. */
	fullPath: string;
	fnName: string;
	isTarget: boolean;
	desiredParent: boolean;
	finalDir: string;
	finalFile: string;
	existing: RouteNode | null;
	created: boolean;
	promoted: boolean;
	oldFile: string | null;
	baseContents: string;
}

// ─── Planning ───────────────────────────────────────────────────────────────

/** Builds the full {@link Plan} for a request. Performs no IO. */
export function planRoute(
	root: RouteNode,
	request: RouteRequest,
	ctx: GenerateContext,
	entry: EntryFile | null,
): Plan {
	const warnings: string[] = [];
	const planned = resolveChain(root, request, ctx);

	const ops: FileOp[] = [];
	for (let i = 0; i < planned.length; i++) {
		const node = planned[i];
		let contents = node.baseContents;

		if (node.isTarget && node.created && !node.desiredParent) {
			contents = renderLeafFile(node, request, ctx, warnings);
		} else {
			if (!node.isTarget) {
				contents = ensureChildMount(contents, node, planned[i + 1], warnings);
			}
			if (node.isTarget) {
				contents = ensureMethods(contents, node, request, ctx, warnings);
			}
		}

		if (node.created) {
			ops.push({ kind: "write", path: node.finalFile, contents, existed: false });
		} else if (node.promoted) {
			ops.push({ kind: "write", path: node.finalFile, contents, existed: false });
			if (node.oldFile) ops.push({ kind: "remove", path: node.oldFile });
		} else if (contents !== node.existing?.contents) {
			ops.push({ kind: "write", path: node.finalFile, contents, existed: true });
		}
	}

	planWiring(planned[0], entry, ctx, ops, warnings);
	return { ops, warnings };
}

/** Resolves the chain of planned nodes from the root to the target. */
function resolveChain(
	root: RouteNode,
	request: RouteRequest,
	ctx: GenerateContext,
): PlannedNode[] {
	const segments = splitSegments(request.path);
	const planned: PlannedNode[] = [];
	let cursor: RouteNode | null = root;
	let parentDir = ctx.routesDir;
	let fullPath = "";

	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i];
		const segFile = segmentToFileName(segment);
		fullPath = "/" + [...splitSegments(fullPath), segment].join("/");
		const existing: RouteNode | null = cursor ? cursor.children.get(segment) ?? null : null;
		const isTarget = i === segments.length - 1;
		const alreadyParent = existing?.kind === "parent";
		const desiredParent = !isTarget || alreadyParent;

		let finalDir: string;
		let finalFile: string;
		let created = false;
		let promoted = false;
		let oldFile: string | null = null;
		let baseContents = "";

		if (desiredParent) {
			finalDir = joinPath(parentDir, segFile);
			finalFile = joinPath(finalDir, "mod.ts");
			if (!existing) {
				created = true;
				baseContents = emptyModuleFile(moduleFnName(segment));
			} else if (existing.kind === "parent") {
				baseContents = existing.contents ?? emptyModuleFile(moduleFnName(segment));
			} else {
				promoted = true;
				oldFile = existing.file;
				baseContents = rewriteRelativeImports(existing.contents ?? "", existing.file!, finalFile);
			}
		} else {
			const chosen = request.filename && isTarget ? request.filename : segFile;
			const basename = chosen.replace(/\.ts$/, "");
			finalDir = parentDir;
			finalFile = joinPath(parentDir, basename + ".ts");
			if (!existing) created = true;
			else baseContents = existing.contents ?? "";
		}

		planned.push({
			segment,
			ownPath: nodeRoutePath(segment),
			fullPath,
			fnName: moduleFnName(segment),
			isTarget,
			desiredParent,
			finalDir,
			finalFile,
			existing,
			created,
			promoted,
			oldFile,
			baseContents,
		});

		if (desiredParent) parentDir = finalDir;
		cursor = existing;
	}

	return planned;
}

// ─── Editing ────────────────────────────────────────────────────────────────

/**
 * Ensures `parent` imports and mounts `child` at the parent's own path. The
 * import specifier is refreshed even when the mount already exists, so a child
 * that was just promoted from `users.ts` to `users/mod.ts` has its parent's
 * import corrected from `./users.ts` to `./users/mod.ts`.
 */
function ensureChildMount(
	contents: string,
	parent: PlannedNode,
	child: PlannedNode,
	warnings: string[],
): string {
	const varName = findModuleVar(contents) ?? "router";
	const specifier = relativeSpecifier(parent.finalFile, child.finalFile);

	const next = importsName(contents, child.fnName)
		? updateImportSpecifier(contents, child.fnName, specifier)
		: addImport(contents, specifier, [child.fnName]);

	if (hasMount(next, varName, parent.ownPath, child.fnName)) return next;

	const mount = renderMount(parent.ownPath, child.segment, varName);
	const inserted = insertBeforeReturn(next, varName, [mount]);
	if (inserted === null) {
		warnings.push(
			`Could not find "return ${varName};" in ${parent.finalFile}; ` +
				`add \`${mount}\` manually.`,
		);
		return next;
	}
	return inserted;
}

/** Applies the requested methods to the target node's own route. */
function ensureMethods(
	contents: string,
	node: PlannedNode,
	request: RouteRequest,
	ctx: GenerateContext,
	warnings: string[],
): string {
	const varName = findModuleVar(contents) ?? "router";

	const shorthand = findShorthand(contents, varName, node.ownPath);
	if (shorthand) {
		const extra = request.methods.filter((m) => m !== shorthand.method);
		if (extra.length > 0) {
			warnings.push(
				`${node.fullPath} is a single-method shorthand (${shorthand.method.toUpperCase()}); ` +
					`leaving it untouched. Convert it to a .route() chain to add ${
						extra.map((m) => m.toUpperCase()).join(", ")
					}.`,
			);
		}
		return contents;
	}

	const usedBody = request.bodySchema && request.methods.some((m) => BODY_METHODS.includes(m));
	const emitResponds = request.responseSchemas.length > 0;
	contents = withSchemaImports(
		contents,
		node.finalFile,
		ctx,
		usedBody ? request.bodySchema : undefined,
		emitResponds ? request.responseSchemas : [],
	);

	const chain = findRouteChain(contents, varName, node.ownPath);
	if (chain) {
		let append = "";
		for (const method of request.methods) {
			if (chainHasMethod(chain.text, method)) continue;
			append += indentLines(
				methodPiece(method, node.fullPath, bodySchemaFor(method, request)),
				"\t",
			);
		}
		if (emitResponds && !chainHasResponds(chain.text)) {
			append += indentLines(
				respondsPiece(primaryMethod(request.methods), request.responseSchemas),
				"\t",
			);
		}
		if (append === "") {
			warnings.push(`${node.fullPath} already has ${request.methods.join(", ")}; nothing to add.`);
			return contents;
		}
		return insertBeforeChainEnd(contents, chain, append);
	}

	const statement = buildRouteStatement(node, request, varName, warnings);
	const inserted = insertBeforeReturn(contents, varName, [statement]);
	if (inserted === null) {
		warnings.push(
			`Could not find "return ${varName};" in ${node.finalFile}; add the route manually.`,
		);
		return contents;
	}
	return inserted;
}

/** Renders a whole new leaf file, methods and schemas included. */
function renderLeafFile(
	node: PlannedNode,
	request: RouteRequest,
	ctx: GenerateContext,
	warnings: string[],
): string {
	const useShorthand = wantsShorthand(request, warnings);
	const imports: string[] = [];

	const usedBody = !useShorthand && request.bodySchema &&
		bodyMethodsOf(request.methods).length > 0;
	const emitResponds = !useShorthand && request.responseSchemas.length > 0;

	if (useShorthand && request.bodySchema) {
		warnings.push("--body-schema is ignored for a shorthand route.");
	}
	if (useShorthand && request.responseSchemas.length > 0) {
		warnings.push("--response-schema is ignored for a shorthand route.");
	}

	const refs: SchemaRef[] = [];
	if (usedBody && request.bodySchema) refs.push(request.bodySchema);
	if (emitResponds) refs.push(...request.responseSchemas);
	imports.push(...groupedSchemaImports(node.finalFile, ctx, refs));

	const statement = useShorthand
		? renderShorthand(node.ownPath, {
			fullPath: node.fullPath,
			methods: request.methods,
			responseSchemas: [],
		})
		: renderRouteChain(node.ownPath, {
			fullPath: node.fullPath,
			methods: request.methods,
			bodySchema: usedBody ? request.bodySchema : undefined,
			responseSchemas: emitResponds ? request.responseSchemas : [],
		});

	return renderModuleFile({ fnName: node.fnName, imports, body: [statement] });
}

/** Builds a single route statement to splice into an existing file. */
function buildRouteStatement(
	node: PlannedNode,
	request: RouteRequest,
	varName: string,
	warnings: string[],
): string {
	if (wantsShorthand(request, warnings)) {
		return renderShorthand(node.ownPath, {
			fullPath: node.fullPath,
			methods: request.methods,
			responseSchemas: [],
			varName,
		});
	}
	const usedBody = request.bodySchema && bodyMethodsOf(request.methods).length > 0;
	return renderRouteChain(node.ownPath, {
		fullPath: node.fullPath,
		methods: request.methods,
		bodySchema: usedBody ? request.bodySchema : undefined,
		responseSchemas: request.responseSchemas,
		varName,
	});
}

// ─── Wiring ─────────────────────────────────────────────────────────────────

/**
 * Ensures a new or moved top-level module is imported and mounted in the entry
 * file. Only a module the generator itself just created or moved is touched — a
 * module that was already present is left as its author wired it, since a stray
 * mount is worse than a missing one.
 */
function planWiring(
	top: PlannedNode,
	entry: EntryFile | null,
	ctx: GenerateContext,
	ops: FileOp[],
	warnings: string[],
): void {
	if (!ctx.wire) return;
	if (!top.created && !top.promoted) return;

	if (!entry) {
		warnings.push(
			`No entry file found to wire ${top.fnName} into; ` +
				`add \`router.use(${top.fnName}());\` to your app yourself.`,
		);
		return;
	}

	const varName = findModuleVar(entry.contents);
	if (!varName) {
		warnings.push(
			`Could not find a Router in ${entry.path}; ` +
				`add \`router.use(${top.fnName}());\` yourself.`,
		);
		return;
	}

	const specifier = relativeSpecifier(entry.path, top.finalFile);
	let contents = entry.contents;

	if (importsName(contents, top.fnName)) {
		contents = updateImportSpecifier(contents, top.fnName, specifier);
	} else {
		contents = addImport(contents, specifier, [top.fnName]);
	}

	const mounted = new RegExp(
		varName + "\\s*\\.\\s*use\\s*\\(\\s*" + top.fnName + "\\s*\\(",
	).test(contents);
	if (!mounted) {
		const statement = `${varName}.use(${top.fnName}());`;
		const inserted = insertBeforeServe(contents, statement);
		if (inserted === null) {
			warnings.push(
				`Wired the import but could not find where to mount ${top.fnName} in ${entry.path}; ` +
					`add \`${statement}\` before Deno.serve yourself.`,
			);
		} else {
			contents = inserted;
		}
	}

	if (contents !== entry.contents) {
		ops.push({ kind: "write", path: entry.path, contents, existed: true });
	}
}

// ─── Schema import helpers ──────────────────────────────────────────────────

function bodySchemaFor(method: Method, request: RouteRequest): SchemaRef | undefined {
	return request.bodySchema && BODY_METHODS.includes(method) ? request.bodySchema : undefined;
}

/** One `import { ... } from "..."` line per module, names merged. */
function groupedSchemaImports(
	routeFile: string,
	ctx: GenerateContext,
	refs: SchemaRef[],
): string[] {
	const bySpec = new Map<string, string[]>();
	for (const ref of refs) {
		const spec = relativeSpecifier(routeFile, joinPath(ctx.projectRoot, ref.module));
		const names = bySpec.get(spec) ?? [];
		if (!names.includes(ref.name)) names.push(ref.name);
		bySpec.set(spec, names);
	}
	return [...bySpec].map(([spec, names]) =>
		`import { ${sortNames(names).join(", ")} } from "${spec}";`
	);
}

/** Adds the body and response schema imports to `contents`. */
function withSchemaImports(
	contents: string,
	routeFile: string,
	ctx: GenerateContext,
	body: SchemaRef | undefined,
	responses: SchemaRef[],
): string {
	let next = contents;
	if (body) {
		const target = joinPath(ctx.projectRoot, body.module);
		next = addImport(next, relativeSpecifier(routeFile, target), [body.name]);
	}
	const byModule = new Map<string, string[]>();
	for (const ref of responses) {
		const target = joinPath(ctx.projectRoot, ref.module);
		const spec = relativeSpecifier(routeFile, target);
		const names = byModule.get(spec) ?? [];
		if (!names.includes(ref.name)) names.push(ref.name);
		byModule.set(spec, names);
	}
	for (const [spec, names] of byModule) next = addImport(next, spec, names);
	return next;
}

// ─── Small helpers ──────────────────────────────────────────────────────────

function emptyModuleFile(fnName: string): string {
	return `import { Router } from "${ROUTER_SPECIFIER}";\n\n` +
		`export function ${fnName}(): Router {\n` +
		`\tconst router = new Router();\n\n` +
		`\treturn router;\n}\n`;
}

function wantsShorthand(request: RouteRequest, warnings: string[]): boolean {
	if (!request.shorthand) return false;
	if (request.methods.length !== 1) {
		warnings.push(
			`--shorthand needs exactly one method; got ${request.methods.length}. ` +
				`Falling back to a .route() chain.`,
		);
		return false;
	}
	return true;
}

// ─── Applying ───────────────────────────────────────────────────────────────

/** Executes a plan, or, when `ctx.dryRun`, describes it without writing. */
export async function applyPlan(plan: Plan, ctx: GenerateContext): Promise<void> {
	for (const op of plan.ops) {
		if (op.kind === "write") {
			const verb = op.existed ? "update" : "create";
			ctx.log(`${ctx.dryRun ? "would " + verb : verb}: ${op.path}`);
			if (!ctx.dryRun) {
				await ensureDirOf(op.path);
				await Deno.writeTextFile(op.path, op.contents);
			}
		} else {
			ctx.log(`${ctx.dryRun ? "would remove" : "remove"}: ${op.path}`);
			if (!ctx.dryRun) await Deno.remove(op.path).catch(() => {});
		}
	}
	for (const warning of plan.warnings) ctx.log(`! ${warning}`);
}
