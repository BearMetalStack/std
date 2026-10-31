import type { LexerContext, Rule } from "../types.ts";
import { appendLeaf, textFallback } from "./helpers.ts";

type CodeData = { value: string; lang?: string; label?: string; meta?: string };

/**
 * A fence's info string: ```` ```lang [label] {meta} ````. The label names the block (a file name,
 * a tab in a group); meta is passed through untouched for whatever renders it. Both need a
 * language in front, so a first line that merely starts with `[` stays code.
 */
const INFO = /^([A-Za-z0-9_+#.-]+)(?:[ \t]+\[([^\]\n]*)\])?(?:[ \t]+\{([^}\n]*)\})?[ \t]*$/;

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

/** The length of the run of `ch` starting at `at`. */
function runAt(input: string, at: number, ch = "`"): number {
	let n = 0;
	while (input[at + n] === ch) n++;
	return n;
}

/**
 * The closing fence for a block opened by `n` backticks at `from`: a later line holding nothing but
 * a run of at least `n` backticks. Returns where the content ends and the input after the fence.
 */
function closingFence(
	input: string,
	from: number,
	n: number,
): { end: number; after: number } | null {
	const fence = new RegExp(`\\n[ \\t]*\`{${n},}[ \\t]*(?=\\n|$)`, "g");
	fence.lastIndex = from;
	const m = fence.exec(input);
	return m ? { end: m.index, after: m.index + m[0].length } : null;
}

/**
 * The matching close for an inline span opened by `n` backticks: the next run of exactly `n`.
 * Returns the index of that run, or -1.
 */
function closingRun(input: string, from: number, n: number): number {
	for (let i = from; i < input.length;) {
		if (input[i] !== "`") {
			i++;
			continue;
		}
		const len = runAt(input, i);
		if (len === n) return i;
		i += len;
	}
	return -1;
}

export const codeBlockRule: Rule<CodeData> = {
	id: "md:codeblock",
	trigger: "`",
	validate: (ctx) => ctx.peek(3) === "```" && ctx.cursor === ctx.lineStart,

	tokenize(ctx) {
		// A fence of n backticks closes on a line of at least n, so a longer fence can hold a
		// shorter one, the way `serialize` writes a block that contains backticks. A block with no
		// closing line falls back to the next ``` anywhere, as fences always closed before.
		const n = runAt(ctx.input, ctx.cursor);
		const close = closingFence(ctx.input, ctx.cursor + n, n);
		let content: string | null;
		if (close) {
			content = ctx.input.slice(ctx.cursor + n, close.end);
			ctx.cursor = close.after - 1;
		} else {
			content = n === 3 ? consumeSpan(ctx, "```", 3) : null;
		}
		if (content === null) {
			ctx.cursor += n - 1; // fallback: emit the backticks as literal text
			return textFallback<CodeData>("`".repeat(n));
		}
		// The info string (```ts) used to be folded into the code body, so a
		// fenced block's language ended up as the first line of its own
		// content. Split it off when the first line is a bare language token.
		const nl = content.indexOf("\n");
		const first = nl < 0 ? "" : content.slice(0, nl);
		const info = INFO.exec(first);
		const body = info ? content.slice(nl + 1) : content;
		// drop a single leading/trailing newline the way fenced blocks read visually
		const value = body.replace(/^\n/, "").replace(/\n$/, "");
		const data: CodeData = { value };
		if (info) data.lang = info[1];
		if (info?.[2] !== undefined) data.label = info[2];
		if (info?.[3] !== undefined) data.meta = info[3];
		return { tag: "md:codeblock", data };
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
		const { lang, label, meta } = node.data;
		let info = lang ?? "";
		if (lang && label !== undefined) info += ` [${label}]`;
		if (lang && meta !== undefined) info += ` {${meta}}`;
		return `${fence}${info}\n${value}\n${fence}`;
	},
};

export const inlineCodeRule: Rule<CodeData> = {
	id: "md:code",
	trigger: "`",
	validate: (ctx) => ctx.peek(2) !== "` ",

	tokenize(ctx) {
		// A span opened by n backticks closes at the next run of exactly n, so ``a ` b`` holds a
		// backtick. One space each side is padding when both are there, as `serialize` writes it.
		const n = runAt(ctx.input, ctx.cursor);
		const close = closingRun(ctx.input, ctx.cursor + n, n);
		if (close < 0) {
			ctx.cursor += n - 1;
			return textFallback<CodeData>("`".repeat(n));
		}
		let value = ctx.input.slice(ctx.cursor + n, close);
		if (n > 1 && value.length > 2 && value.startsWith(" ") && value.endsWith(" ") && value.trim()) {
			value = value.slice(1, -1);
		}
		ctx.cursor = close + n - 1;
		return { tag: "md:code", data: { value } };
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
