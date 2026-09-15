/**
 * @module
 * Single-pass `.aff` (Hunspell affix file) parser.
 *
 * Walks the file once and builds the final `Suffixes`/`Prefixes` lookup tables directly — there is
 * no intermediate AST in this milestone (see ROADMAP.md).
 */

import { type FlagMode, parseFlagMode } from "./flags.ts";

export interface AffixRule {
	/** Substring to remove from the stem, or `null` for "0" (nothing stripped). */
	strip: string | null;
	/** Substring to append (suffix) or prepend (prefix). Continuation flags are stripped off. */
	add: string;
	/** Hunspell's condition mini-syntax, compiled to a real `RegExp` at parse time. */
	condition: RegExp;
}

export interface AffixTable {
	crossProduct: boolean;
	rules: AffixRule[];
}

/** Suffix affix tables, keyed by normalized flag. */
export type Suffixes = Map<string, AffixTable>;
/** Prefix affix tables, keyed by normalized flag. */
export type Prefixes = Map<string, AffixTable>;

export interface ParsedAff {
	flagMode: FlagMode;
	suffixes: Suffixes;
	prefixes: Prefixes;
	/** Raw values of simple key-value directives (`SET`, `TRY`, `WORDCHARS`, `LANG`, `IGNORE`). */
	directives: Map<string, string>;
}

export interface ParseAffOptions {
	/** When true, unhandled directives are announced via `console.warn`. */
	debug?: boolean;
}

/**
 * Directives that are handled directly by this parser (structurally or by storing their value)
 * and therefore never produce an "unhandled directive" warning.
 */
const HANDLED_DIRECTIVES = new Set([
	"SET",
	"FLAG",
	"TRY",
	"WORDCHARS",
	"LANG",
	"IGNORE",
	"SFX",
	"PFX",
]);

/**
 * Directives that are followed by a line count and that many subsequent lines (the same shape as
 * `SFX`/`PFX`). Not implemented in this milestone, but recognized so the line count is honored and
 * parsing doesn't misalign on their table rows.
 */
const TABLE_DIRECTIVES = new Set([
	"REP",
	"MAP",
	"PHONE",
	"BREAK",
	"AF",
	"AM",
	"ICONV",
	"OCONV",
	"COMPOUNDRULE",
	"CHECKCOMPOUNDPATTERN",
]);

/** Compiles Hunspell's condition mini-syntax (a strict subset of regex character classes) to a RegExp. */
export function compileCondition(condition: string, kind: "prefix" | "suffix"): RegExp {
	let pattern = "";
	for (let i = 0; i < condition.length; i++) {
		const char = condition[i];
		if (char === "[") {
			const end = condition.indexOf("]", i);
			if (end === -1) {
				throw new Error(`Unterminated character class in condition: ${condition}`);
			}
			pattern += condition.slice(i, end + 1);
			i = end;
			continue;
		}
		if (char === ".") {
			pattern += ".";
			continue;
		}
		if ("\\^$*+?()|{}".includes(char)) {
			pattern += "\\" + char;
			continue;
		}
		pattern += char;
	}
	return kind === "suffix" ? new RegExp(pattern + "$") : new RegExp("^" + pattern);
}

function warnUnhandled(directive: string, debug: boolean | undefined) {
	if (debug) {
		console.warn(`[@bearmetal/flux] unhandled .aff directive: ${directive}`);
	}
}

export function parseAff(text: string, options: ParseAffOptions = {}): ParsedAff {
	const lines = text.split(/\r?\n/);
	let flagMode: FlagMode = "default";
	const suffixes: Suffixes = new Map();
	const prefixes: Prefixes = new Map();
	const directives = new Map<string, string>();

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line.length === 0 || line.startsWith("#")) continue;

		const tokens = line.split(/\s+/);
		const directive = tokens[0];

		if (directive === "FLAG") {
			flagMode = parseFlagMode(tokens[1]);
			continue;
		}

		if (directive === "SFX" || directive === "PFX") {
			const flag = tokens[1];
			const crossProduct = tokens[2] === "Y";
			const count = Number.parseInt(tokens[3], 10) || 0;
			const rules: AffixRule[] = [];
			for (let j = 1; j <= count; j++) {
				const ruleLine = lines[i + j];
				if (ruleLine === undefined) break;
				const ruleTokens = ruleLine.trim().split(/\s+/);
				const stripRaw = ruleTokens[2];
				const addRaw = ruleTokens[3];
				const conditionRaw = ruleTokens[4] ?? "";
				const slashIndex = addRaw.indexOf("/");
				const add = slashIndex === -1 ? addRaw : addRaw.slice(0, slashIndex);
				rules.push({
					strip: stripRaw === "0" ? null : stripRaw,
					add: add === "0" ? "" : add,
					condition: compileCondition(
						conditionRaw,
						directive === "SFX" ? "suffix" : "prefix",
					),
				});
			}
			const table: AffixTable = { crossProduct, rules };
			(directive === "SFX" ? suffixes : prefixes).set(flag, table);
			i += count;
			continue;
		}

		if (TABLE_DIRECTIVES.has(directive)) {
			const count = Number.parseInt(tokens[1], 10) || 0;
			warnUnhandled(directive, options.debug);
			i += count;
			continue;
		}

		if (HANDLED_DIRECTIVES.has(directive)) {
			directives.set(directive, tokens.slice(1).join(" "));
			continue;
		}

		warnUnhandled(directive, options.debug);
	}

	return { flagMode, suffixes, prefixes, directives };
}
