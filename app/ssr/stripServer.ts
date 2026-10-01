/**
 * Removing server-only code from a bundle on its way to the browser.
 *
 * Two things are stripped: class members named in `names` (`serverInit`,
 * `stylesheet`) have their bodies emptied, and free functions whose name starts
 * with one of `prefixes` are deleted along with their call sites.
 *
 * This runs over bundler output, which is minified in production, and that is
 * the whole difficulty. A match is only a definition if it sits in code —
 * `serverInit` inside a string literal, a comment or a regex is not one — so
 * every pass works against a mask of where the code actually is, built once by
 * {@linkcode scanMask}. The previous version rescanned from the start of the
 * file for each candidate with a scanner that did not know regex literals from
 * division; on a real minified bundle it desynced partway through and silently
 * left the *rest* of the file's `serverInit` bodies in place, which is how a
 * database query reaches a browser.
 *
 * Because a mask is only valid for the string it was built from, edits are
 * collected first and applied at the end, back to front.
 *
 * @module
 */

import { codeMask } from "@bearmetal/miscellanea/string";

/**
 * Marks every character as code (`0`) or not-code (`1`). Lives in `@bearmetal/miscellanea` as
 * `codeMask`, shared with the dev server's import scanner.
 */
export const scanMask: (src: string) => Uint8Array = codeMask;

const SERVER_FN_PREFIXES = ["server"];

/**
 * Modifiers that may sit between the start of a member and its name.
 *
 * All of them, in any order and any number, because this now runs over source
 * as well as over bundler output: `override async serverInit()` is how the
 * method is actually written, and a pattern that only knew `static`, `async`
 * and `get` skipped every component that spelled it that way. TypeScript drops
 * `override` on the way out, which is why post-bundle stripping never noticed.
 */
const MODIFIER = "(?:static|override|async|get|set|public|private|protected|abstract|declare)";

/** One replacement to make, as an index range into the source. */
type Edit = { start: number; end: number; text: string };

/** Index of the `}` closing the block that opens at `openBrace`, or -1. */
function findBlockEnd(src: string, mask: Uint8Array, openBrace: number): number {
	let depth = 0;
	for (let i = openBrace; i < src.length; i++) {
		if (mask[i]) continue;
		if (src[i] === "{") depth++;
		else if (src[i] === "}" && --depth === 0) return i;
	}
	return -1;
}

/** Index of the `)` closing the parens that open at `openParen`, or -1. */
function findParenEnd(src: string, mask: Uint8Array, openParen: number): number {
	let depth = 0;
	for (let i = openParen; i < src.length; i++) {
		if (mask[i]) continue;
		if (src[i] === "(") depth++;
		else if (src[i] === ")" && --depth === 0) return i;
	}
	return -1;
}

// ── Finding the things to remove ─────────────────────────────────────────────

/**
 * Class members, static or not, whose body should be emptied.
 *
 * The server half of a component is an *instance* method (`serverInit`), which
 * makes a definition nearly indistinguishable from a call, so a match only
 * counts in member position: at the start of the source, or straight after `{`,
 * `}`, `;` or a newline. A call site is always preceded by a `.` or an `=`, and
 * neither qualifies.
 */
function classMethodEdits(src: string, mask: Uint8Array, name: string): Edit[] {
	const pattern = new RegExp(
		`(^|[{};\\n])([ \\t\\n]*(?:${MODIFIER}\\s+)*${name}\\s*\\()`,
		"g",
	);
	const edits: Edit[] = [];
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(src)) !== null) {
		const start = match.index + match[1].length;
		if (mask[start]) continue;

		const parenOpen = match.index + match[0].length - 1;
		const parenEnd = findParenEnd(src, mask, parenOpen);
		if (parenEnd === -1) continue;

		let braceIdx = parenEnd + 1;
		while (braceIdx < src.length && /\s/.test(src[braceIdx])) braceIdx++;
		if (src[braceIdx] !== "{") continue;

		const blockEnd = findBlockEnd(src, mask, braceIdx);
		if (blockEnd === -1) continue;

		// Keep the signature so the class shape — and anything that checks whether
		// the method was overridden — still holds; drop only what it does.
		edits.push({ start: braceIdx, end: blockEnd + 1, text: "{}" });
		pattern.lastIndex = blockEnd;
	}

	return edits;
}

/** `function name(){}`, `const name = function(){}` and `const name = () => {}`. */
function functionDefinitionEdits(src: string, mask: Uint8Array, name: string): Edit[] {
	const patterns = [
		new RegExp(`(^|\\n)([ \\t]*(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\()`, "g"),
		new RegExp(
			`(^|[\\n;{}])([ \\t]*(?:export\\s+)?(?:const|let|var)\\s+${name}\\s*=\\s*(?:async\\s+)?function[^{(]*\\()`,
			"g",
		),
		new RegExp(
			`(^|[\\n;{}])([ \\t]*(?:export\\s+)?(?:const|let|var)\\s+${name}\\s*=\\s*(?:async\\s+)?\\()`,
			"g",
		),
	];

	const edits: Edit[] = [];
	for (const pattern of patterns) {
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(src)) !== null) {
			const start = match.index + match[1].length;
			if (mask[start]) continue;

			const parenEnd = findParenEnd(src, mask, match.index + match[0].length - 1);
			if (parenEnd === -1) continue;

			let braceIdx = parenEnd + 1;
			while (braceIdx < src.length && /[\s=>]/.test(src[braceIdx])) braceIdx++;
			if (src[braceIdx] !== "{") continue;

			const blockEnd = findBlockEnd(src, mask, braceIdx);
			if (blockEnd === -1) continue;

			let end = blockEnd + 1;
			if (src[end] === ";") end++;
			edits.push({ start, end, text: "" });
			pattern.lastIndex = blockEnd;
		}
	}
	return edits;
}

/** Statement-position calls: `name(…);` or `await name(…);`. */
function callsiteEdits(src: string, mask: Uint8Array, name: string): Edit[] {
	const pattern = new RegExp(`(^|[\\n;{}])([ \\t]*(?:await\\s+)?${name}\\s*\\()`, "g");
	const edits: Edit[] = [];
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(src)) !== null) {
		const start = match.index + match[1].length;
		if (mask[start]) continue;

		const parenEnd = findParenEnd(src, mask, match.index + match[0].length - 1);
		if (parenEnd === -1) continue;

		// `name(){…}` in member position is a definition, not a call — and deleting
		// it outright would take the name off a method the class still needs.
		// `classMethodEdits` handles those; here they are skipped.
		let after = parenEnd + 1;
		while (after < src.length && /\s/.test(src[after])) after++;
		if (src[after] === "{") continue;

		let end = parenEnd + 1;
		if (src[end] === ";") end++;
		edits.push({ start, end, text: "" });
		pattern.lastIndex = parenEnd;
	}
	return edits;
}

function findServerFunctionNames(src: string, mask: Uint8Array, prefixes: string[]): string[] {
	const names = new Set<string>();
	const pattern = /(?:function\s+|const\s+|let\s+|var\s+)([A-Za-z0-9_$]+)\s*(?:=|\()/g;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(src)) !== null) {
		if (mask[match.index]) continue;
		if (prefixes.some((p) => match![1].startsWith(p))) names.add(match[1]);
	}

	return [...names];
}

// ── Applying them ────────────────────────────────────────────────────────────

/** Applies edits back to front, so earlier indices stay valid, dropping overlaps. */
function applyEdits(src: string, edits: Edit[]): string {
	const ordered = [...edits].sort((a, b) => b.start - a.start);
	let result = src;
	let lastStart = src.length + 1;

	for (const edit of ordered) {
		if (edit.end > lastStart) continue; // nested inside an edit already applied
		result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
		lastStart = edit.start;
	}

	return result;
}

/**
 * Empties server-only members and deletes server-only functions.
 *
 * @param src bundler output, minified or not.
 * @param options `names` are class members to empty; `prefixes` name free
 * functions to delete outright, defaulting to anything starting with `server`.
 */
export function stripServerCode(
	src: string,
	options?: { prefixes?: string[]; names?: string[] },
): string {
	const prefixes = options?.prefixes ?? SERVER_FN_PREFIXES;
	const explicit = options?.names ?? [];

	const mask = scanMask(src);
	const discovered = findServerFunctionNames(src, mask, prefixes);
	const targets = [...new Set([...discovered, ...explicit])];

	const edits: Edit[] = [];
	for (const name of targets) {
		edits.push(
			...classMethodEdits(src, mask, name),
			...functionDefinitionEdits(src, mask, name),
			...callsiteEdits(src, mask, name),
		);
	}

	const result = applyEdits(src, edits);
	for (const name of targets) reportSurvivors(result, name);

	return result.replace(/\n{3,}/g, "\n\n");
}

/**
 * Complains about a definition that made it through.
 *
 * Silence is the dangerous outcome here: the response is a valid bundle either
 * way, and nobody looks at 40KB of minified JavaScript to check whether a
 * `serverInit` body is still in it. If this ever fires, something in the source
 * shape is not covered above and server code is on its way to a browser.
 */
function reportSurvivors(src: string, name: string): void {
	const mask = scanMask(src);
	const pattern = new RegExp(
		`(^|[{};\\n])[ \\t\\n]*(?:${MODIFIER}\\s+)*${name}\\s*\\([^)]*\\)\\s*\\{[^}]`,
		"g",
	);
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(src)) !== null) {
		if (mask[match.index + match[1].length]) continue;
		console.warn(
			`stripServerCode left a non-empty "${name}" in the bundle, so server-only code is ` +
				`about to reach the browser. Near: ${
					JSON.stringify(src.slice(match.index, match.index + 80))
				}`,
		);
		return;
	}
}

// CLI usage: deno run strip-server.ts <input.js> [output.js]
if (import.meta.main) {
	const [input, output] = Deno.args;
	if (!input) {
		console.error("Usage: strip-server.ts <input.js> [output.js]");
		Deno.exit(1);
	}

	const stripped = stripServerCode(await Deno.readTextFile(input));

	if (output) {
		await Deno.writeTextFile(output, stripped);
		console.log(`Stripped output written to ${output}`);
	} else {
		console.log(stripped);
	}
}
