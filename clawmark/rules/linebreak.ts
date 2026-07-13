import type { Rule } from "../types.ts";
import { appendLeaf } from "./helpers.ts";

type Data = Record<string, never>;

/**
 * `\` immediately followed by a newline is a hard break *within* the
 * current paragraph - it deliberately consumes the newline itself so the
 * core lexer's blank-line/paragraph-break handling never sees it (matches
 * v1's `case "\\"`, which does the same by jumping the cursor past both
 * characters in one step).
 */
export const linebreakRule: Rule<Data> = {
	id: "md:linebreak",
	trigger: "\\",
	validate: (ctx) => ctx.peek(1, 1) === "\n",

	tokenize(ctx) {
		ctx.cursor += 1;
		return { tag: "md:linebreak", data: {} };
	},

	tree: (_token, ctx) => appendLeaf(ctx, "md:linebreak", {}),
	renderOpen: () => "<br>",
};
