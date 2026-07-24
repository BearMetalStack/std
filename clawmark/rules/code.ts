import type { LexerContext, Rule } from "../types.ts";
import { appendLeaf, textFallback } from "./helpers.ts";

type CodeData = { value: string; lang?: string };

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
		// The info string (```ts) used to be folded into the code body, so a
		// fenced block's language ended up as the first line of its own
		// content. Split it off when the first line is a bare language token.
		const nl = content.indexOf("\n");
		const first = nl < 0 ? "" : content.slice(0, nl);
		const lang = /^[A-Za-z0-9_+#.-]+$/.test(first) ? first : undefined;
		const body = lang ? content.slice(nl + 1) : content;
		// drop a single leading/trailing newline the way fenced blocks read visually
		const value = body.replace(/^\n/, "").replace(/\n$/, "");
		return { tag: "md:codeblock", data: lang ? { value, lang } : { value } };
	},

	tree: (token, ctx) => appendLeaf(ctx, "md:codeblock", token.data),

	renderOpen: (node) => {
		const cls = node.data.lang ? ` class="language-${escapeForCode(node.data.lang)}"` : "";
		return `<pre class="code"><code${cls}>${escapeForCode(node.data.value)}</code>`;
	},
	renderClose: () => "</pre>",
	matchTag: "pre",
	preserveWhitespace: true,
	// <pre class="code"><code class="language-ts"> is this rule's own output,
	// but a bare <pre> from elsewhere works identically.
	match(el, ctx) {
		const code = ctx.child("code", el);
		const target = code ?? el;
		const cls = target.attrs.get("class") ?? "";
		const lang = /(?:^|\s)language-([\w+#.-]+)/.exec(cls)?.[1];
		// Drop one leading/trailing newline, the same way tokenize() does for a
		// fenced block - `<pre><code>x\n</code></pre>` is visually one line.
		const value = ctx.raw(target).replace(/^\n/, "").replace(/\n$/, "");
		const data: Record<string, unknown> = { value };
		if (lang) data.lang = lang;
		return { kind: "leaf", tag: "md:codeblock", data };
	},

	serializeKind: "block",

	serialize(node) {
		const value = node.data.value;
		// The fence must be longer than the longest backtick run inside, or the
		// block closes early on re-lex.
		const longest = Math.max(0, ...(value.match(/`+/g) ?? []).map((r) => r.length));
		const fence = "`".repeat(Math.max(3, longest + 1));
		return `${fence}${node.data.lang ?? ""}\n${value}\n${fence}`;
	},
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

	matchTag: "code",
	preserveWhitespace: true,
	// A <code> directly inside a <pre> was already consumed by codeBlockRule,
	// which does not recurse; reaching here means a standalone inline span.
	match: (el, ctx) => ({ kind: "leaf", tag: "md:code", data: { value: ctx.raw(el) } }),

	tree: (token, ctx) => appendLeaf(ctx, "md:code", token.data),

	renderOpen: (node) => `<code>${escapeForCode(node.data.value)}</code>`,

	serialize(node) {
		const value = node.data.value;
		const longest = Math.max(0, ...(value.match(/`+/g) ?? []).map((r) => r.length));
		const fence = "`".repeat(Math.max(1, longest + 1));
		// A leading/trailing backtick in the content needs padding spaces, which
		// the reader strips back off.
		const pad = value.startsWith("`") || value.endsWith("`") ? " " : "";
		return `${fence}${pad}${value}${pad}${fence}`;
	},
};

/** Local escape, not the shared `escapeHtml` from helpers.ts, so code content's
 * literal `&`/`<`/`>` survive without also mangling quotes inside e.g. code
 * containing `"`. */
function escapeForCode(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
