import type { Rule } from "../types.ts";
import { appendLeaf, textFallback } from "./helpers.ts";

type Data = Record<string, never>;

/**
 * Characters that lose their syntactic meaning when preceded by `\`. This is
 * the set of `Rule.trigger` values across `defaultRules()`, plus the
 * bracket/paren punctuation that link and image syntax consumes.
 */
const ESCAPABLE = new Set([..."\\`*_~=#>|[]()!-.+"]);

/**
 * Owns both jobs of the `\` character.
 *
 * `\` immediately followed by a newline is a hard break *within* the current
 * paragraph - it deliberately consumes the newline itself so the core lexer's
 * blank-line/paragraph-break handling never sees it (matches v1's `case "\\"`,
 * which does the same by jumping the cursor past both characters in one step).
 *
 * `\` followed by any other escapable character emits that character as
 * literal text. Before this existed, backslash escaping was a no-op - `\*`
 * lexed as a literal backslash *plus* an emphasis token - so escaped output
 * was strictly worse than unescaped output and nothing the markdown serializer
 * emitted could survive a round trip. Both behaviors live in one rule rather
 * than two because the lexer indexes rules by trigger character, and one
 * character should have exactly one owner.
 */
export const linebreakRule: Rule<Data> = {
	id: "md:linebreak",
	trigger: "\\",
	validate: (ctx) => {
		const next = ctx.peek(1, 1);
		return next === "\n" || ESCAPABLE.has(next);
	},

	tokenize(ctx) {
		const next = ctx.peek(1, 1);
		ctx.cursor += 1;
		if (next === "\n") return { tag: "md:linebreak", data: {} };
		return textFallback<Data>(next);
	},

	tree: (_token, ctx) => appendLeaf(ctx, "md:linebreak", {}),
	renderOpen: () => "<br>",
	matchTag: "br",
	match: () => ({ kind: "leaf", tag: "md:linebreak", data: {} }),

	serialize: () => "\\\n",
};

export { ESCAPABLE };
