import type { LexerContext, Node, Token, TokenIdentifier, TreeContext } from "../types.ts";

/**
 * A handful of rules bail out to a literal `core:text` token when a span
 * they thought they recognized turns out to be unclosed (e.g. an opening
 * backtick with no matching close). `core:text` isn't shaped like the
 * rule's own `T`, but the tree builder special-cases that tag before ever
 * touching `.data`, so this is a safe, deliberate escape hatch from the
 * per-rule `Token<T>` typing rather than a real type hole.
 */
export function textFallback<T>(value: string): Token<T> {
	return { tag: "core:text", data: { value } } as unknown as Token<T>;
}

/** Escapes text for safe inclusion in HTML. v1 (webbies/lib/md/html.ts) does not
 * escape output at all, which is a stored-XSS footgun the moment untrusted
 * markdown reaches innerHTML. This engine escapes text content and every
 * attribute value it interpolates instead - a deliberate improvement, not a
 * behavior port. */
export function escapeHtml(input: string): string {
	return input
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

/** Appends a childless leaf node under whatever is currently open. */
export function appendLeaf<T>(ctx: TreeContext, tag: TokenIdentifier, data: T): Node<T> {
	const node: Node<T> = { tag, data, children: [] };
	const parent = ctx.currentNode;
	node.parent = parent;
	parent.children.push(node as Node);
	return node;
}

/** Appends a node under whatever is currently open, then pushes it as the new top. */
export function openNode<T>(ctx: TreeContext, tag: TokenIdentifier, data: T): Node<T> {
	const node = appendLeaf(ctx, tag, data);
	ctx.stack.push(node as Node);
	return node;
}

/** Pops the current top of the stack, closing it. */
export function closeNode(ctx: TreeContext): Node | undefined {
	return ctx.stack.pop();
}

/**
 * Closes the current node if it is one of `tags` - used by list/blockquote
 * rules that need to close a dangling item before opening (or closing) a
 * sibling/parent, mirroring v1's repeated
 * `if (current.type === "listitem" || ...) this.close();` checks.
 */
export function closeIfCurrentIs(ctx: TreeContext, ...tags: TokenIdentifier[]): void {
	if (tags.includes(ctx.currentNode.tag)) closeNode(ctx);
}

/**
 * Advances the cursor to land on the line's trailing newline (so the
 * lexer's own newline handling picks it up next iteration), consuming
 * everything in between. Mirrors v1's repeated
 * `cursor += lineEnd - cursor - 1` (hr, blockquote-hr) via
 * `toNextSubstring` instead of reaching into the raw input directly.
 * No-ops safely (instead of walking the cursor backwards, as v1 does) when
 * there's no trailing newline left in the document.
 */
export function consumeRestOfLine(ctx: LexerContext): void {
	const seg = ctx.toNextSubstring("\n");
	if (!seg) return;
	ctx.cursor += seg.length - 2;
}
