import type {
	EngineRule,
	EscapePosition,
	ListFrame,
	Node,
	SerializeContext,
	SerializeOptions,
	TokenIdentifier,
} from "./types.ts";
import { ROOT_TAG } from "./types.ts";

const DEFAULTS: Required<Omit<SerializeOptions, "onWarn">> = {
	bullet: "-",
	emphasis: "*",
	strong: "**",
	listIndent: 2,
	escape: true,
	eof: "\n",
};

/**
 * Characters that are always significant to some rule's `validate`, wherever
 * they appear. Derived from the trigger set of `defaultRules()`:
 *
 *   - `` ` ``  inlineCodeRule.validate is `peek(2) !== "` "` - fires nearly anywhere
 *   - `*` `_`  the emphasis triggers are `validate: () => true`
 *   - `[`      link/footnote validates use unbounded lookahead; a blanket
 *              escape is cheaper than reimplementing them here
 *   - `\`      it is the escape character itself
 */
const ALWAYS_RX = /([\\`*_[\]])/g;

/**
 * Characters that only start a construct at the beginning of a line. Every one
 * of these rules guards on `ctx.cursor === ctx.lineStart` (or, for lists, on
 * the text before the cursor being pure whitespace/digits), so escaping them
 * mid-line would be pure noise.
 */
const LINE_START_RX = /^(\s*)(#{1,6}(?=\s|$)|>|\||---|-(?=\s)|\d+(?=\.))/;

/**
 * Node -> markdown. Walks the tree the way `Renderer` does, but two-tier:
 * block children are separated by a blank line, inline children are
 * concatenated.
 *
 * The contract every `serialize` hook follows is: **return your node's content
 * with no surrounding blank lines and no line prefix applied.** Framing is the
 * parent's job. Threading a mutable prefix down through the recursion instead
 * is how blockquote-inside-list bugs happen.
 */
export class MarkdownSerializer {
	#byTag: Map<TokenIdentifier, EngineRule>;
	#blockTags: Set<TokenIdentifier>;
	#opts: Required<Omit<SerializeOptions, "onWarn">> & Pick<SerializeOptions, "onWarn">;
	#lists: ListFrame[] = [];
	#deferred = new Map<string, string>();
	#state = new Map<string, unknown>();
	/** True when the next emitted character would begin a line. */
	#atLineStart = true;

	constructor(rules: EngineRule[], options: SerializeOptions = {}) {
		this.#byTag = new Map(rules.map((rule) => [rule.id, rule]));
		this.#opts = { ...DEFAULTS, ...options };

		// Built from the rule array rather than from rules/paragraph.ts's
		// BLOCK_TAGS: that set answers "does this child collapse the wrapping
		// <p>", so it omits core:paragraph, md:listitem, md:lineitem and
		// md:tablerow. Reusing it here would be wrong, and extending it would
		// change forward rendering.
		this.#blockTags = new Set(
			rules.filter((r) => r.serializeKind === "block").map((r) => r.id),
		);
		this.#blockTags.add("core:paragraph");
	}

	serialize(root: Node): string {
		const ctx = this.#ctx();
		let out = root.tag === ROOT_TAG ? ctx.children(root) : ctx.node(root);

		const deferred = [...this.#deferred.values()];
		if (deferred.length > 0) out += (out ? "\n\n" : "") + deferred.join("\n\n");

		return out
			// Safe only because clawmark's hard break is `\` + newline, not the
			// two-trailing-spaces convention. Do not "fix" this.
			.replace(/[ \t]+$/gm, "")
			.replace(/\n{3,}/g, "\n\n")
			.replace(/^\n+/, "")
			.replace(/\n+$/, "") + this.#opts.eof;
	}

	#isBlock(node: Node): boolean {
		return this.#blockTags.has(node.tag);
	}

	#ctx(): SerializeContext {
		// deno-lint-ignore no-this-alias
		const self = this;
		const ctx: SerializeContext = {
			options: this.#opts,
			get lists() {
				return self.#lists;
			},
			get state() {
				return self.#state;
			},
			withList: (frame, fn) => {
				self.#lists.push(frame);
				try {
					return fn(frame);
				} finally {
					self.#lists.pop();
				}
			},
			node: (node) => self.#node(node, ctx),
			children: (node) => self.#children(node, ctx),
			text: (node) => self.#flatten(node),
			isBlock: (node) => self.#isBlock(node),
			escape: (value, position) => self.#escape(value, position),
			prefixLines: (text, first, rest, restBlank) => prefixLines(text, first, rest, restBlank),
			defer: (key, block) => {
				self.#deferred.set(key, block);
			},
			warn: (message, node) => self.#opts.onWarn?.(message, node),
		};
		return ctx;
	}

	#node(node: Node, ctx: SerializeContext): string {
		if (node.tag === ROOT_TAG) return this.#children(node, ctx);

		if (node.tag === "core:text") {
			const raw = (node.data as { value: string }).value;
			const out = this.#escape(raw, this.#atLineStart ? "lineStart" : "inline");
			if (out !== "") this.#atLineStart = out.endsWith("\n");
			return out;
		}

		const rule = this.#byTag.get(node.tag);
		if (!rule?.serialize) {
			// No serializer: fall through to the children, which is the right
			// behavior for purely presentational wrappers.
			return this.#children(node, ctx);
		}

		const wasBlock = this.#isBlock(node);
		if (wasBlock) this.#atLineStart = true;
		const out = rule.serialize(node, ctx);
		this.#atLineStart = wasBlock ? true : out.endsWith("\n");
		return out;
	}

	/**
	 * Coalesces runs of adjacent `core:text` siblings.
	 *
	 * Escaping decisions are lookahead-sensitive (`~` only matters before
	 * another `~`), but the lexer freely splits text across nodes - `\~\~b`
	 * arrives as four separate text nodes. Escaping each in isolation would
	 * never see the pair. Crawled trees have the same property wherever an
	 * unwrapped element sat between two text runs.
	 */
	#coalesce(children: Node[]): Node[] {
		const out: Node[] = [];
		for (const child of children) {
			const last = out[out.length - 1];
			if (child.tag === "core:text" && last?.tag === "core:text") {
				out[out.length - 1] = {
					...last,
					data: {
						value: (last.data as { value: string }).value +
							(child.data as { value: string }).value,
					},
				};
				continue;
			}
			out.push(child);
		}
		return out;
	}

	#children(node: Node, ctx: SerializeContext): string {
		const parts: { text: string; block: boolean }[] = [];
		for (const child of this.#coalesce(node.children)) {
			const block = this.#isBlock(child);
			if (block) this.#atLineStart = true;
			const text = this.#node(child, ctx);
			// Deferred and dropped nodes vanish cleanly rather than leaving a
			// stray blank line behind.
			if (text === "") continue;
			parts.push({ text, block });
		}

		let out = "";
		for (let i = 0; i < parts.length; i++) {
			if (i > 0 && (parts[i].block || parts[i - 1].block)) out += "\n\n";
			out += parts[i].text;
		}
		return out;
	}

	/** Plain-text flattening, used for table cells and link text. */
	#flatten(node: Node): string {
		if (node.tag === "core:text") return (node.data as { value: string }).value;
		const data = node.data as { value?: string; text?: string; alt?: string };
		if (typeof data?.value === "string") return data.value;
		if (typeof data?.text === "string") return data.text;
		return node.children.map((c) => this.#flatten(c)).join("");
	}

	#escape(value: string, position: EscapePosition = "inline"): string {
		if (!this.#opts.escape) return value;

		if (position === "linkDest") {
			// LINK_BODY_RX captures the destination as [\S]*, so any whitespace
			// breaks parsing outright.
			return value.replaceAll(" ", "%20").replaceAll("(", "%28").replaceAll(")", "%29");
		}
		if (position === "title") return value.replaceAll('"', "'");
		if (position === "linkText") {
			// Link text and image alt are opaque in *both* directions:
			// LINK_BODY_RX captures them raw and renderOpen only html-escapes
			// them, so they are never re-lexed as markdown. Escaping here would
			// inject a literal backslash into the captured text and break the
			// round trip - `[**a**](x)` must come back out unchanged.
			return value;
		}

		let out = value
			.replace(ALWAYS_RX, "\\$1")
			.replace(/~(?=~)/g, "\\~")
			.replace(/=(?==)/g, "\\=")
			.replace(/!(?=\[)/g, "\\!");

		if (position === "cell") out = out.replaceAll("|", "\\|");
		if (position === "lineStart") out = out.replace(LINE_START_RX, "$1\\$2");
		return out;
	}
}

/**
 * Prefixes every line of `text`. Blank lines get `restBlank` (defaulting to a
 * trimmed `rest`) so nothing is left carrying trailing whitespace.
 */
export function prefixLines(
	text: string,
	first: string,
	rest: string,
	restBlank?: string,
): string {
	const blank = restBlank ?? rest.trimEnd();
	return text
		.split("\n")
		.map((line, i) => {
			const p = i === 0 ? first : line === "" ? blank : rest;
			return p + line;
		})
		.join("\n");
}
