/**
 * @module Telling JavaScript code apart from the strings, comments and regex literals inside it,
 * for scanners that need to know whether a match is really code.
 */

/** Mask values {@linkcode codeMask} produces. */
export const CodeMask = { Code: 0, NotCode: 1 } as const;

/** Characters after which a `/` opens a regex literal rather than dividing. */
const REGEX_ALLOWED_AFTER = new Set([
	"(",
	",",
	"=",
	":",
	"[",
	"!",
	"&",
	"|",
	"?",
	"{",
	"}",
	";",
	"+",
	"-",
	"*",
	"%",
	"~",
	"^",
	"<",
	">",
	"\n",
]);

/** Keywords after which a `/` opens a regex literal. */
const REGEX_ALLOWED_KEYWORDS = [
	"return",
	"typeof",
	"instanceof",
	"case",
	"delete",
	"void",
	"in",
	"of",
	"new",
	"do",
	"else",
	"yield",
	"await",
];

function regexAllowedAt(src: string, slash: number): boolean {
	let i = slash - 1;
	while (i >= 0 && (src[i] === " " || src[i] === "\t")) i--;
	if (i < 0) return true;
	const c = src[i];
	if (REGEX_ALLOWED_AFTER.has(c)) return true;
	// A word character could end an identifier (division) or a keyword (regex).
	if (!/[A-Za-z0-9_$]/.test(c)) return false;
	const end = i + 1;
	while (i >= 0 && /[A-Za-z0-9_$]/.test(src[i])) i--;
	return REGEX_ALLOWED_KEYWORDS.includes(src.slice(i + 1, end));
}

/**
 * Marks every character of JavaScript `src` as code (`0`) or not-code (`1`: inside a string,
 * template literal text, comment or regex literal), in one left-to-right pass.
 *
 * Handles the three string forms (including `${…}` interpolation, where the
 * interpolated part is code again and may nest further templates), both comment
 * forms, and regex literals — the one the old scanner missed, and the reason it
 * lost track of where it was.
 */
export function codeMask(src: string): Uint8Array {
	const mask = new Uint8Array(src.length);
	// Depth of `${}` nesting per open template literal, so a `}` knows whether it
	// closes an interpolation or is an ordinary brace inside it.
	const templates: number[] = [];
	let i = 0;

	const fill = (from: number, to: number) =>
		mask.fill(CodeMask.NotCode, from, Math.min(to, src.length));

	while (i < src.length) {
		const c = src[i];
		const next = src[i + 1];

		if (c === "/" && next === "/") {
			const end = src.indexOf("\n", i);
			fill(i, end === -1 ? src.length : end);
			i = end === -1 ? src.length : end;
			continue;
		}
		if (c === "/" && next === "*") {
			const end = src.indexOf("*/", i + 2);
			fill(i, end === -1 ? src.length : end + 2);
			i = end === -1 ? src.length : end + 2;
			continue;
		}
		if (c === "/" && regexAllowedAt(src, i)) {
			let j = i + 1;
			let inClass = false;
			for (; j < src.length; j++) {
				const d = src[j];
				if (d === "\\") {
					j++;
					continue;
				}
				if (d === "\n") break; // unterminated: it was division after all
				if (d === "[") inClass = true;
				else if (d === "]") inClass = false;
				else if (d === "/" && !inClass) break;
			}
			if (j < src.length && src[j] === "/") {
				while (j + 1 < src.length && /[dgimsuvy]/.test(src[j + 1])) j++;
				fill(i, j + 1);
				i = j + 1;
				continue;
			}
			i++;
			continue;
		}
		if (c === "'" || c === '"') {
			let j = i + 1;
			for (; j < src.length; j++) {
				if (src[j] === "\\") {
					j++;
					continue;
				}
				if (src[j] === c || src[j] === "\n") break;
			}
			fill(i, j + 1);
			i = j + 1;
			continue;
		}
		if (c === "`") {
			templates.push(0);
			mask[i] = CodeMask.NotCode;
			i++;
			// Consume the literal part up to `${`, the closing backtick, or EOF.
			while (i < src.length) {
				if (src[i] === "\\") {
					fill(i, i + 2);
					i += 2;
					continue;
				}
				if (src[i] === "`") {
					mask[i] = CodeMask.NotCode;
					templates.pop();
					i++;
					break;
				}
				if (src[i] === "$" && src[i + 1] === "{") {
					fill(i, i + 2);
					i += 2;
					break; // back to the outer loop: the interpolation is code
				}
				mask[i] = CodeMask.NotCode;
				i++;
			}
			continue;
		}
		if (c === "}" && templates.length > 0) {
			if (templates[templates.length - 1] === 0) {
				// Closes an interpolation: resume the surrounding template literal.
				mask[i] = CodeMask.NotCode;
				i++;
				while (i < src.length) {
					if (src[i] === "\\") {
						fill(i, i + 2);
						i += 2;
						continue;
					}
					if (src[i] === "`") {
						mask[i] = CodeMask.NotCode;
						templates.pop();
						i++;
						break;
					}
					if (src[i] === "$" && src[i + 1] === "{") {
						fill(i, i + 2);
						i += 2;
						break;
					}
					mask[i] = CodeMask.NotCode;
					i++;
				}
				continue;
			}
			templates[templates.length - 1]--;
			i++;
			continue;
		}
		if (c === "{" && templates.length > 0) {
			templates[templates.length - 1]++;
			i++;
			continue;
		}
		i++;
	}

	return mask;
}

/**
 * Every index in `src` where `pattern` matches with its first character in code — not inside a
 * string, comment or regex literal. `pattern` must be global.
 */
export function* codeMatches(
	src: string,
	pattern: RegExp,
	mask: Uint8Array = codeMask(src),
): Generator<RegExpExecArray> {
	for (const m of src.matchAll(pattern)) {
		if (mask[m.index] === CodeMask.Code) yield m as RegExpExecArray;
	}
}
