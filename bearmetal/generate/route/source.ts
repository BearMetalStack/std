/**
 * Small, string-level surgery over an existing route file.
 *
 * A route file is not regenerated when it is edited — the author's handlers must
 * survive — so changes are made by finding an anchor (an import block, a
 * `.route()` chain, the `return router;` line) and splicing text in around it.
 * The scanner respects strings and comments so a `;` inside a string literal is
 * never mistaken for a statement terminator.
 *
 * @module
 */

import { directoryOf, escapeRegex, joinPath } from "@bearmetal/miscellanea";
import { relativeSpecifier } from "./path.ts";

/** A located `.route()` chain: its bounds in the source and the text between. */
export interface RouteChain {
	/** Index of the first character of `<var>.route(...)`. */
	start: number;
	/** Index of the terminating `;`. */
	end: number;
	/** The chain text, from `start` up to but excluding the `;`. */
	text: string;
}

/**
 * Finds the index of the `;` that terminates the statement beginning at `from`,
 * ignoring any `;` nested in brackets, strings, template literals or comments.
 * Returns the source length if the statement is unterminated.
 */
export function statementEnd(src: string, from: number): number {
	let depth = 0;
	let i = from;
	const n = src.length;
	while (i < n) {
		const c = src[i];
		if (c === '"' || c === "'" || c === "`") {
			i = skipString(src, i);
			continue;
		}
		if (c === "/" && src[i + 1] === "/") {
			const nl = src.indexOf("\n", i);
			i = nl === -1 ? n : nl;
			continue;
		}
		if (c === "/" && src[i + 1] === "*") {
			const close = src.indexOf("*/", i + 2);
			i = close === -1 ? n : close + 2;
			continue;
		}
		if (c === "(" || c === "{" || c === "[") depth++;
		else if (c === ")" || c === "}" || c === "]") depth--;
		else if (c === ";" && depth === 0) return i;
		i++;
	}
	return n;
}

/**
 * Advances past a string or template literal that starts at `i`. A `${ ... }`
 * interpolation is skipped to its matching brace; strings nested inside one are
 * rare in a route file and not worth a full tokeniser.
 */
function skipString(src: string, i: number): number {
	const quote = src[i];
	i++;
	const n = src.length;
	while (i < n) {
		const c = src[i];
		if (c === "\\") {
			i += 2;
			continue;
		}
		if (quote === "`" && c === "$" && src[i + 1] === "{") {
			i += 2;
			let depth = 1;
			while (i < n && depth > 0) {
				if (src[i] === "{") depth++;
				else if (src[i] === "}") depth--;
				i++;
			}
			continue;
		}
		if (c === quote) return i + 1;
		i++;
	}
	return n;
}

/** Locates `<varName>.route("<routePath>")` and the statement it heads. */
export function findRouteChain(
	src: string,
	varName: string,
	routePath: string,
): RouteChain | null {
	const re = new RegExp(
		escapeRegex(varName) + "\\s*\\.\\s*route\\s*\\(\\s*[\"'`]" +
			escapeRegex(routePath) + "[\"'`]\\s*\\)",
	);
	const m = re.exec(src);
	if (!m) return null;
	const start = m.index;
	const end = statementEnd(src, start);
	return { start, end, text: src.slice(start, end) };
}

/** Whether a chain already configures the given method. */
export function chainHasMethod(chainText: string, method: string): boolean {
	return new RegExp("\\.\\s*" + escapeRegex(method) + "\\s*\\(").test(chainText);
}

/** Whether a chain already has a `.responds(` call. */
export function chainHasResponds(chainText: string): boolean {
	return /\.\s*responds\s*\(/.test(chainText);
}

/** Locates a single-method shorthand `<varName>.<method>("<routePath>"`. */
export function findShorthand(
	src: string,
	varName: string,
	routePath: string,
): { method: string; start: number; end: number } | null {
	const re = new RegExp(
		escapeRegex(varName) + "\\s*\\.\\s*(get|post|put|patch|delete|options)\\s*\\(\\s*[\"'`]" +
			escapeRegex(routePath) + "[\"'`]\\s*,",
	);
	const m = re.exec(src);
	if (!m) return null;
	const start = m.index;
	return { method: m[1], start, end: statementEnd(src, start) };
}

/**
 * Whether `childFn` is already mounted at `routePath`, i.e. there is a
 * `<varName>.use("<routePath>", childFn(...))` statement.
 */
export function hasMount(
	src: string,
	varName: string,
	routePath: string,
	childFn: string,
): boolean {
	const re = new RegExp(
		escapeRegex(varName) + "\\s*\\.\\s*use\\s*\\(\\s*[\"'`]" + escapeRegex(routePath) +
			"[\"'`]\\s*,\\s*" + escapeRegex(childFn) + "\\s*\\(",
	);
	return re.test(src);
}

/** The `const <name> = new Router()` / `new Module()` variable, if any. */
export function findModuleVar(src: string): string | null {
	const m = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+(?:Router|Module)\s*\(/.exec(src);
	return m ? m[1] : null;
}

/**
 * Ensures `import { ...names } from "<spec>"` is present, merging into an
 * existing import from the same specifier when possible. Returns the source
 * unchanged when everything is already imported.
 */
export function addImport(src: string, spec: string, names: string[]): string {
	const existing = new RegExp(
		"import\\s*\\{([^}]*)\\}\\s*from\\s*[\"']" + escapeRegex(spec) + "[\"'];?",
	).exec(src);

	if (existing) {
		const current = existing[1]
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		const merged = [...current];
		for (const name of names) if (!merged.includes(name)) merged.push(name);
		if (merged.length === current.length) return src;
		const replacement = `import { ${sortNames(merged).join(", ")} } from "${spec}";`;
		return src.slice(0, existing.index) + replacement +
			src.slice(existing.index + existing[0].length);
	}

	const line = `import { ${sortNames(names).join(", ")} } from "${spec}";`;
	const at = lastImportEnd(src);
	if (at === null) return line + "\n" + src;
	return src.slice(0, at) + "\n" + line + src.slice(at);
}

/** Sorts import names the way `deno fmt` does: case-insensitive, ascending. */
export function sortNames(names: string[]): string[] {
	return [...names].sort((a, b) => {
		const la = a.toLowerCase();
		const lb = b.toLowerCase();
		if (la !== lb) return la < lb ? -1 : 1;
		return a < b ? -1 : a > b ? 1 : 0;
	});
}

/** Index just past the last top-level `import ...;`, or null if there are none. */
function lastImportEnd(src: string): number | null {
	const re = /^import\b/gm;
	let last: number | null = null;
	let m: RegExpExecArray | null;
	while ((m = re.exec(src)) !== null) {
		last = statementEnd(src, m.index) + 1;
	}
	return last;
}

/**
 * Splices `statements` in just before the `return <varName>;` line, matching its
 * indentation. Returns null when no such return is found.
 */
export function insertBeforeReturn(
	src: string,
	varName: string,
	statements: string[],
): string | null {
	const re = new RegExp("\\n([\\t ]*)return\\s+" + escapeRegex(varName) + "\\s*;");
	const m = re.exec(src);
	if (!m) return null;
	const indent = m[1];
	const block = statements
		.map((s) => s.split("\n").map((l) => (l ? indent + l : l)).join("\n"))
		.join("\n\n");
	const insertAt = m.index + 1;
	return src.slice(0, insertAt) + block + "\n\n" + src.slice(insertAt);
}

/** Inserts `text` immediately before the chain's terminating `;`. */
export function insertBeforeChainEnd(src: string, chain: RouteChain, text: string): string {
	return src.slice(0, chain.end) + text + src.slice(chain.end);
}

/**
 * Rewrites every relative import specifier in `src` so it still resolves after
 * the file is moved from `oldFile` to `newFile`. Bare specifiers such as
 * `"@bearmetal/router"` are left untouched.
 */
export function rewriteRelativeImports(src: string, oldFile: string, newFile: string): string {
	const oldDir = directoryOf(oldFile);
	return src.replace(
		/(from\s*|import\s*)(["'])(\.[^"']*)\2/g,
		(_full, keyword: string, quote: string, spec: string) => {
			const target = joinPath(oldDir, spec);
			return `${keyword}${quote}${relativeSpecifier(newFile, target)}${quote}`;
		},
	);
}

/** Replaces the specifier of an existing named import of `name`, if present. */
export function updateImportSpecifier(src: string, name: string, newSpec: string): string {
	return src.replace(
		new RegExp(
			"(import\\s*\\{[^}]*\\b" + escapeRegex(name) +
				"\\b[^}]*\\}\\s*from\\s*[\"'])([^\"']+)([\"'])",
		),
		(_full, pre: string, _old: string, post: string) => `${pre}${newSpec}${post}`,
	);
}

/** Whether `src` names `name` in any import. */
export function importsName(src: string, name: string): boolean {
	return new RegExp(
		"import\\s*\\{[^}]*\\b" + escapeRegex(name) + "\\b[^}]*\\}\\s*from",
	).test(src);
}

/**
 * Inserts a top-level statement before the app's `serveDirectory`/`Deno.serve`
 * call, which is where a route mount must go to be registered before the static
 * catch-all. Returns null when neither anchor is found.
 */
export function insertBeforeServe(src: string, statement: string): string | null {
	const anchors = [
		/\n[\t ]*[A-Za-z_$][\w$]*\s*\.\s*serveDirectory\s*\(/,
		/\n[\t ]*Deno\s*\.\s*serve\s*\(/,
	];
	for (const re of anchors) {
		const m = re.exec(src);
		if (m) {
			const at = m.index + 1;
			return src.slice(0, at) + statement + "\n" + src.slice(at);
		}
	}
	return null;
}
