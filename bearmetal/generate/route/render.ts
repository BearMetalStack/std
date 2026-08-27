/**
 * Code emission.
 *
 * Everything here returns text at "relative" indentation: a statement's first
 * line has no leading tab, its continuations are indented relative to it. The
 * caller decides the final column — {@link renderModuleFile} indents a whole
 * body into a function, {@link indentLines} shifts a fragment to match an
 * existing chain. Keeping emission indentation-agnostic is what lets the same
 * `methodPiece` be used both to build a fresh file and to splice a method onto a
 * chain already in one.
 *
 * Generated files export a `Router` (not a bare `Module`): a `Router` supports
 * both the chained `router.route(p).get(h)` form and the shorthand
 * `router.get(p, h)` form, and mounting children with `router.use(p, child())`,
 * so a single, consistent file shape covers every case the generator emits.
 *
 * @module
 */

import type { Method, ResponseSchemaRef, SchemaRef } from "./types.ts";
import { BODY_METHODS } from "./types.ts";
import { moduleFnName, ownRoutePath } from "./path.ts";

/** The specifier every generated route file imports `Router` from. */
export const ROUTER_SPECIFIER = "@bearmetal/router";

/** Indents every non-empty line of `text` by `prefix`. */
export function indentLines(text: string, prefix: string): string {
	return text
		.split("\n")
		.map((line) => (line ? prefix + line : line))
		.join("\n");
}

/**
 * The default stub handler for a method. `baseTabs` is the indentation of the
 * line the handler lives on, so its body and closing brace nest correctly
 * whether it sits on a chained `.get(...)` line (one tab in) or a top-level
 * shorthand `router.get(...)` line (no tabs).
 */
function handler(method: Method, fullPath: string, baseTabs: number): string {
	const body = "\t".repeat(baseTabs + 1);
	const close = "\t".repeat(baseTabs);
	return `() => {\n${body}return new Response("${method.toUpperCase()} ${fullPath}");\n${close}}`;
}

/** Which requested methods a body schema is attached to. */
export function bodyMethodsOf(methods: Method[]): Method[] {
	return methods.filter((m) => BODY_METHODS.includes(m));
}

/** The method a `.responds()` block is attached to: GET if present, else the first. */
export function primaryMethod(methods: Method[]): Method {
	return methods.includes("get") ? "get" : methods[0];
}

/** A single `.<method>(...)` piece of a chain, e.g. `\n\t.get(() => {...})`. */
export function methodPiece(
	method: Method,
	fullPath: string,
	bodySchema?: SchemaRef,
): string {
	const withBody = bodySchema && BODY_METHODS.includes(method);
	const prefix = withBody ? `${bodySchema.name}, ` : "";
	return `\n\t.${method}(${prefix}${handler(method, fullPath, 1)})`;
}

/** A `.responds("get", { 200: ok })` piece, or `""` when there are no responses. */
export function respondsPiece(method: Method, responses: ResponseSchemaRef[]): string {
	if (responses.length === 0) return "";
	const byStatus = new Map<number, string>();
	for (const res of responses) byStatus.set(res.status, res.name);
	const entries = [...byStatus].map(([status, name]) => `${status}: ${name}`).join(", ");
	return `\n\t.responds("${method}", { ${entries} })`;
}

/** Options shared by the chain/shorthand renderers. */
export interface RenderRouteOptions {
	fullPath: string;
	methods: Method[];
	bodySchema?: SchemaRef;
	responseSchemas: ResponseSchemaRef[];
	varName?: string;
}

/**
 * A chained route statement, at relative indentation:
 *
 * ```ts
 * router.route("/users")
 * 	.get(() => { ... })
 * 	.post(schema, () => { ... })
 * 	.responds("get", { 200: ok });
 * ```
 */
export function renderRouteChain(routePath: string, opts: RenderRouteOptions): string {
	const varName = opts.varName ?? "router";
	const pieces = opts.methods.map((m) => methodPiece(m, opts.fullPath, opts.bodySchema));
	const responds = respondsPiece(primaryMethod(opts.methods), opts.responseSchemas);
	return `${varName}.route("${routePath}")${pieces.join("")}${responds};`;
}

/**
 * A single-method shorthand statement, at relative indentation:
 *
 * ```ts
 * router.get("/users", () => { ... });
 * ```
 */
export function renderShorthand(routePath: string, opts: RenderRouteOptions): string {
	const varName = opts.varName ?? "router";
	const method = opts.methods[0];
	return `${varName}.${method}("${routePath}", ${handler(method, opts.fullPath, 0)});`;
}

/** A `router.use("/api", usersModule());` mount statement, at relative indentation. */
export function renderMount(
	parentRoutePath: string,
	childSegment: string,
	varName = "router",
): string {
	return `${varName}.use("${parentRoutePath}", ${moduleFnName(childSegment)}());`;
}

/** A whole new route-module file. */
export function renderModuleFile(opts: {
	fnName: string;
	imports: string[];
	body: string[];
}): string {
	const importLines = [
		`import { Router } from "${ROUTER_SPECIFIER}";`,
		...opts.imports,
	].join("\n");
	const body = opts.body
		.map((statement) => indentLines(statement, "\t"))
		.join("\n\n");
	return `${importLines}\n\nexport function ${opts.fnName}(): Router {\n` +
		`\tconst router = new Router();\n\n` +
		`${body}\n\n` +
		`\treturn router;\n}\n`;
}

/** The route path a node declares for its own segment. */
export function nodeRoutePath(segment: string): string {
	return ownRoutePath(segment);
}
