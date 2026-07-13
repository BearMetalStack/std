import type { LexerContext, Rule } from "../types.ts";
import { appendLeaf, textFallback } from "./helpers.ts";

type CodeData = { value: string };

/**
 * Unlike v1 (which flips a lexer-wide `isInCodeBlock`/`isInCode` flag and
 * keeps scanning char-by-char in a separate branch until it sees the
 * closing delimiter), these rules resolve the whole span in one
 * `tokenize()` call via `toNextSubstring` and jump the cursor straight to
 * the close - no lexer-level mode needed, and content inside never gets
 * accidentally re-lexed as other constructs (matching v1's *intent*, since
 * v1's mode flags exist for exactly that reason).
 */
function consumeSpan(ctx: LexerContext, delimiter: string, openLen: number): string | null {
	const seg = ctx.toNextSubstring(delimiter, openLen);
	if (!seg) return null;
	const content = seg.slice(0, -delimiter.length);
	ctx.cursor += openLen - 1 + seg.length;
	return content;
}

export const codeBlockRule: Rule<CodeData> = {
	id: "md:codeblock",
	trigger: "`",
	validate: (ctx) => ctx.peek(3) === "```" && ctx.cursor === ctx.lineStart,

	tokenize(ctx) {
		const content = consumeSpan(ctx, "```", 3);
		if (content === null) {
			ctx.cursor += 2; // fallback: emit the 3 backticks as literal text
			return textFallback<CodeData>("```");
		}
		// drop a single leading/trailing newline the way fenced blocks read visually
		const value = content.replace(/^\n/, "").replace(/\n$/, "");
		return { tag: "md:codeblock", data: { value } };
	},

	tree: (token, ctx) => appendLeaf(ctx, "md:codeblock", token.data),

	renderOpen: (node) => `<pre class="code"><code>${escapeForCode(node.data.value)}</code>`,
	renderClose: () => "</pre>",
};

export const inlineCodeRule: Rule<CodeData> = {
	id: "md:code",
	trigger: "`",
	validate: (ctx) => ctx.peek(2) !== "` ",

	tokenize(ctx) {
		const content = consumeSpan(ctx, "`", 1);
		if (content === null) {
			return textFallback<CodeData>("`");
		}
		return { tag: "md:code", data: { value: content } };
	},

	tree: (token, ctx) => appendLeaf(ctx, "md:code", token.data),

	renderOpen: (node) => `<code>${escapeForCode(node.data.value)}</code>`,
};

/** Local escape, not the shared `escapeHtml` from helpers.ts, so code content's
 * literal `&`/`<`/`>` survive without also mangling quotes inside e.g. code
 * containing `"`. */
function escapeForCode(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
