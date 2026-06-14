/**
 * Strips server-only function definitions and their callsites from an unminified bundle.
 * Targets named functions by convention (e.g. serverRender, serverLoad).
 */

const SERVER_FN_PREFIXES = ["server"];

function isInStringOrComment(src: string, idx: number): boolean {
	let inSingle = false;
	let inDouble = false;
	let inTemplate = false;
	let inLineComment = false;
	let inBlockComment = false;

	for (let i = 0; i < idx; i++) {
		const c = src[i];
		const next = src[i + 1];

		if (inLineComment) {
			if (c === "\n") inLineComment = false;
			continue;
		}
		if (inBlockComment) {
			if (c === "*" && next === "/") {
				inBlockComment = false;
				i++;
			}
			continue;
		}
		if (inSingle) {
			if (c === "\\") {
				i++;
				continue;
			}
			if (c === "'") inSingle = false;
			continue;
		}
		if (inDouble) {
			if (c === "\\") {
				i++;
				continue;
			}
			if (c === '"') inDouble = false;
			continue;
		}
		if (inTemplate) {
			if (c === "\\") {
				i++;
				continue;
			}
			if (c === "`") inTemplate = false;
			continue;
		}

		if (c === "/" && next === "/") {
			inLineComment = true;
			i++;
			continue;
		}
		if (c === "/" && next === "*") {
			inBlockComment = true;
			i++;
			continue;
		}
		if (c === "'") {
			inSingle = true;
			continue;
		}
		if (c === '"') {
			inDouble = true;
			continue;
		}
		if (c === "`") {
			inTemplate = true;
			continue;
		}
	}

	return inSingle || inDouble || inTemplate || inLineComment || inBlockComment;
}

function findBlockEnd(src: string, openBrace: number): number {
	let depth = 0;
	let inSingle = false;
	let inDouble = false;
	let inTemplate = false;
	let inLineComment = false;
	let inBlockComment = false;

	for (let i = openBrace; i < src.length; i++) {
		const c = src[i];
		const next = src[i + 1];

		if (inLineComment) {
			if (c === "\n") inLineComment = false;
			continue;
		}
		if (inBlockComment) {
			if (c === "*" && next === "/") {
				inBlockComment = false;
				i++;
			}
			continue;
		}
		if (inSingle) {
			if (c === "\\") {
				i++;
				continue;
			}
			if (c === "'") inSingle = false;
			continue;
		}
		if (inDouble) {
			if (c === "\\") {
				i++;
				continue;
			}
			if (c === '"') inDouble = false;
			continue;
		}
		if (inTemplate) {
			if (c === "\\") {
				i++;
				continue;
			}
			if (c === "`") inTemplate = false;
			continue;
		}

		if (c === "/" && next === "/") {
			inLineComment = true;
			i++;
			continue;
		}
		if (c === "/" && next === "*") {
			inBlockComment = true;
			i++;
			continue;
		}
		if (c === "'") {
			inSingle = true;
			continue;
		}
		if (c === '"') {
			inDouble = true;
			continue;
		}
		if (c === "`") {
			inTemplate = true;
			continue;
		}

		if (c === "{") depth++;
		if (c === "}") {
			depth--;
			if (depth === 0) return i;
		}
	}

	return -1;
}

function stripFunctionDefinition(src: string, fnName: string): string {
	// Matches: function fnName(...) { ... }
	// Also matches: const/let/var fnName = function(...) { ... }
	// Also matches: const/let/var fnName = (...) => { ... }
	const patterns = [
		// function declaration
		new RegExp(`(^|\\n)([ \\t]*(?:export\\s+)?function\\s+${fnName}\\s*\\([^)]*\\)\\s*)`, "g"),
		// const/let/var = function
		new RegExp(
			`(^|\\n)([ \\t]*(?:export\\s+)?(?:const|let|var)\\s+${fnName}\\s*=\\s*(?:async\\s+)?function[^{]*)`,
			"g",
		),
		// const/let/var = arrow
		new RegExp(
			`(^|\\n)([ \\t]*(?:export\\s+)?(?:const|let|var)\\s+${fnName}\\s*=\\s*(?:async\\s+)?\\([^)]*\\)\\s*=>\\s*)`,
			"g",
		),
	];

	let result = src;

	for (const pattern of patterns) {
		let match;
		while ((match = pattern.exec(result)) !== null) {
			const matchStart = match.index + match[1].length;
			if (isInStringOrComment(result, matchStart)) continue;

			// Find the opening brace
			const braceIdx = result.indexOf("{", matchStart + match[2].length - 1);
			if (braceIdx === -1) continue;

			const blockEnd = findBlockEnd(result, braceIdx);
			if (blockEnd === -1) continue;

			// Include trailing semicolon if present
			let end = blockEnd + 1;
			if (result[end] === ";") end++;

			// Pull back start to include leading newline/whitespace for clean removal
			const start = match.index;

			result = result.slice(0, start) + result.slice(end);
			pattern.lastIndex = 0; // reset since we mutated the string
		}
	}

	return result;
}

function stripCallsites(src: string, fnName: string): string {
	// Remove expression statements: fnName(...); or await fnName(...);
	const pattern = new RegExp(
		`(^|\\n)([ \\t]*(?:await\\s+)?${fnName}\\s*\\()`,
		"g",
	);

	let result = src;
	let match;

	while ((match = pattern.exec(result)) !== null) {
		const matchStart = match.index + match[1].length;
		if (isInStringOrComment(result, matchStart)) continue;

		// Find the opening paren
		const parenOpen = result.indexOf("(", matchStart + match[2].length - 1);
		if (parenOpen === -1) continue;

		// Find matching close paren
		let depth = 0;
		let parenClose = -1;
		for (let i = parenOpen; i < result.length; i++) {
			if (result[i] === "(") depth++;
			if (result[i] === ")") {
				depth--;
				if (depth === 0) {
					parenClose = i;
					break;
				}
			}
		}
		if (parenClose === -1) continue;

		let end = parenClose + 1;
		if (result[end] === ";") end++;

		const start = match.index;
		result = result.slice(0, start) + result.slice(end);
		pattern.lastIndex = 0;
	}

	return result;
}

function findServerFunctionNames(src: string, prefixes: string[]): string[] {
	const names = new Set<string>();
	const pattern = /(?:function\s+|const\s+|let\s+|var\s+)(\w+)\s*(?:=|\()/g;
	let match;

	while ((match = pattern.exec(src)) !== null) {
		const name = match[1];
		if (prefixes.some((p) => name.startsWith(p))) {
			names.add(name);
		}
	}

	return [...names];
}

export function stripServerCode(
	src: string,
	options?: { prefixes?: string[]; names?: string[] },
): string {
	const prefixes = options?.prefixes ?? SERVER_FN_PREFIXES;
	const explicit = options?.names ?? [];

	const discovered = findServerFunctionNames(src, prefixes);
	const allTargets = [...new Set([...discovered, ...explicit])];

	let result = src;
	for (const name of allTargets) {
		result = stripFunctionDefinition(result, name);
		result = stripCallsites(result, name);
	}

	// Clean up excessive blank lines left behind
	result = result.replace(/\n{3,}/g, "\n\n");

	return result;
}

// CLI usage: deno run strip-server.ts <input.js> [output.js]
if (import.meta.main) {
	const [input, output] = Deno.args;
	if (!input) {
		console.error("Usage: strip-server.ts <input.js> [output.js]");
		Deno.exit(1);
	}

	const src = await Deno.readTextFile(input);
	const stripped = stripServerCode(src);

	if (output) {
		await Deno.writeTextFile(output, stripped);
		console.log(`Stripped output written to ${output}`);
	} else {
		console.log(stripped);
	}
}
