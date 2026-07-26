import type {
	CrawlOptions,
	EngineRule,
	MatchContext,
	MatchResult,
	Node,
	ResolvedStyle,
	StyleResolver,
	StyleTable,
	TokenIdentifier,
	UnmatchedHandler,
	UnmatchedPolicy,
	WhitespaceMode,
} from "./types.ts";
import { ROOT_TAG } from "./types.ts";
import type { XmlElement, XmlNode } from "./xml/types.ts";
import { serializeXml } from "./xml/serialize.ts";
import { PRE_ELEMENTS } from "./xml/html_tables.ts";
import { DEFAULT_INHERITS, EMPTY_STYLE_TABLE, lookupAttr, mergeStyle, pickStyle } from "./style.ts";

/** Tags whose serialized form is block-level, for whitespace reset purposes. */
const BLOCK_TAGS = new Set<TokenIdentifier>([
	"core:paragraph",
	"md:heading",
	"md:blockquote",
	"md:lineitem",
	"md:orderedlist",
	"md:unorderedlist",
	"md:listitem",
	"md:checkitem",
	"md:table",
	"md:tablerow",
	"md:tableformat",
	"md:codeblock",
	"md:hr",
	"md:footnotedef",
	"md:raw",
]);

const LIST_TAGS = new Set<TokenIdentifier>(["md:orderedlist", "md:unorderedlist"]);
const ITEM_TAGS = new Set<TokenIdentifier>(["md:listitem", "md:checkitem", "md:lineitem"]);

interface Indexed {
	rule: EngineRule;
	idx: number;
}

/**
 * XML tree -> clawmark `Node` tree.
 *
 * Dispatch mirrors `Lexer.#matchRule`: candidate rules are tried in order and
 * the first non-null `match` wins. The wrinkle is that rules arrive in two
 * buckets - keyed by element local name, and a wildcard bucket for rules that
 * match on resolved style rather than tag name (docx needs this, since there
 * *every* block is a `<w:p>`). Two buckets cannot be ordered against each
 * other by array position alone, so each rule carries its source index and the
 * two are merge-sorted at dispatch, memoized per tag name. Precedence is then
 * exactly "position in the rules array", same as everywhere else in clawmark.
 */
export class Crawler {
	#byTag = new Map<string, Indexed[]>();
	#wildcard: Indexed[] = [];
	#resolved = new Map<string, EngineRule[]>();
	#opts: CrawlOptions;
	#styles?: StyleResolver;
	#table: StyleTable;
	#styleCache = new WeakMap<XmlElement, ResolvedStyle>();
	#state = new Map<string, unknown>();

	/** Whitespace normalizer state. See #emitText for why these live here. */
	#wsMode: WhitespaceMode = "normal";
	#owed = false;
	#atBlockStart = true;

	constructor(options: CrawlOptions = {}) {
		this.#opts = options;
		this.#styles = options.styles;
		this.#table = options.styleTable ?? EMPTY_STYLE_TABLE;

		const rules = options.rules ?? [];
		rules.forEach((rule, idx) => {
			if (!rule.match) return;
			const tags = rule.matchTag === undefined
				? []
				: Array.isArray(rule.matchTag)
				? rule.matchTag
				: [rule.matchTag];
			if (tags.length === 0 || tags.includes("*")) {
				this.#wildcard.push({ rule, idx });
				return;
			}
			for (const tag of tags) {
				const list = this.#byTag.get(tag) ?? [];
				list.push({ rule, idx });
				this.#byTag.set(tag, list);
			}
		});
	}

	#candidates(name: string): EngineRule[] {
		let list = this.#resolved.get(name);
		if (!list) {
			list = [...(this.#byTag.get(name) ?? []), ...this.#wildcard]
				.sort((a, b) => a.idx - b.idx)
				.map((entry) => entry.rule);
			this.#resolved.set(name, list);
		}
		return list;
	}

	// ---- style -----------------------------------------------------------

	styleOf(el: XmlElement): ResolvedStyle {
		const hit = this.#styleCache.get(el);
		if (hit) return hit;
		if (!this.#styles) return {};

		const inherited = el.parent
			? pickStyle(this.styleOf(el.parent), this.#styles.inherits ?? DEFAULT_INHERITS)
			: {};
		const style = mergeStyle(inherited, this.#styles.own(el, this.#table));
		this.#styleCache.set(el, style);
		return style;
	}

	// ---- entry point -----------------------------------------------------

	crawl(root: XmlElement): Node {
		const doc: Node = { tag: ROOT_TAG, data: {}, children: [] };
		this.#visitChildren(root, doc, []);
		return postProcess(doc);
	}

	// ---- traversal -------------------------------------------------------

	#visitChildren(el: XmlElement, parent: Node, ancestors: XmlElement[]) {
		const next = [...ancestors, el];
		for (const child of el.children) this.#visit(child, parent, next);
	}

	#visit(node: XmlNode, parent: Node, ancestors: XmlElement[]) {
		if (node.kind === "text" || node.kind === "cdata") {
			this.#emitText(node.value, parent);
			return;
		}
		if (node.kind !== "element") return;
		this.#visitElement(node, parent, ancestors);
	}

	#visitElement(el: XmlElement, parent: Node, ancestors: XmlElement[]) {
		const ctx = this.#ctx(el, parent, ancestors);

		let result: MatchResult | null = null;
		for (const rule of this.#candidates(el.name)) {
			result = rule.match!(el, ctx) ?? null;
			if (result) break;
		}
		result ??= this.#policyFor(el, ctx);

		switch (result.kind) {
			case "wrap": {
				const tags = Array.isArray(result.tag) ? result.tag : [result.tag];
				if (tags.length === 0) {
					// A wrap with nothing to wrap in is an unwrap.
					this.#visitChildren(el, parent, ancestors);
					break;
				}
				this.#flushOwed(parent, tags[0]);
				const chain: Node[] = [];
				let target = parent;
				for (const tag of tags) {
					const node: Node = {
						tag,
						// Outermost only - an inner md:bold has no use for the
						// outer paragraph's { phase: "open" }.
						data: chain.length === 0 ? result.data ?? {} : {},
						children: [],
						parent: target,
					};
					target.children.push(node);
					chain.push(node);
					target = node;
				}
				const previousMode = this.#wsMode;
				if (result.whitespace) this.#wsMode = result.whitespace;
				else if (PRE_ELEMENTS.has(el.name)) this.#wsMode = "pre";
				for (const node of chain) this.#enterBlock(node);
				this.#visitChildren(el, target, ancestors);
				for (let i = chain.length - 1; i >= 0; i--) this.#exitBlock(chain[i]);
				this.#wsMode = previousMode;
				break;
			}
			case "leaf": {
				this.#flushOwed(parent, result.tag);
				const node: Node = {
					tag: result.tag,
					data: result.data ?? {},
					children: [],
					parent,
				};
				parent.children.push(node);
				this.#enterBlock(node);
				this.#exitBlock(node);
				break;
			}
			case "nodes":
				for (const node of result.nodes) {
					this.#flushOwed(parent, node.tag);
					node.parent = parent;
					parent.children.push(node);
					this.#enterBlock(node);
					this.#exitBlock(node);
				}
				break;
			case "unwrap":
				this.#visitChildren(el, parent, ancestors);
				break;
			case "drop":
				break;
			case "raw": {
				this.#flushOwed(parent, "md:raw");
				const node: Node = {
					tag: "md:raw",
					data: { value: serializeXml(el, this.#opts.mode ?? "xml") },
					children: [],
					parent,
				};
				parent.children.push(node);
				this.#enterBlock(node);
				this.#exitBlock(node);
				break;
			}
			case "custom":
				result.run(parent, ctx);
				break;
		}
	}

	#policyFor(el: XmlElement, ctx: MatchContext): MatchResult {
		const specific = this.#opts.unmatchedByTag?.[el.name];
		const chosen = specific ?? this.#opts.unmatched ?? "unwrap";
		const applied = typeof chosen === "function"
			// A handler returning null falls back to the global policy, so
			// per-tag handlers are allowed to be partial.
			? (chosen as UnmatchedHandler)(el, ctx) ?? this.#globalPolicy(el, ctx)
			: policyToResult(chosen as UnmatchedPolicy);
		return applied;
	}

	#globalPolicy(el: XmlElement, ctx: MatchContext): MatchResult {
		const global = this.#opts.unmatched ?? "unwrap";
		return typeof global === "function"
			? (global as UnmatchedHandler)(el, ctx) ?? { kind: "unwrap" }
			: policyToResult(global as UnmatchedPolicy);
	}

	// ---- whitespace ------------------------------------------------------

	/**
	 * Collapses HTML whitespace into markdown-ready text.
	 *
	 * Done here, during the crawl, rather than at serialize time: that keeps
	 * the invariant "a Node tree always holds markdown-ready text", so a tree
	 * built by the forward `Lexer` is never double-processed and deliberate
	 * spacing in markdown source survives.
	 *
	 * The subtle part is the reset rule. Entering or leaving a *block* clears
	 * the pending-space flag; inline nodes leave it alone. That one
	 * distinction is what keeps the space in `<b>a</b> <i>b</i>` while
	 * dropping it in `<p>a</p> <p>b</p>`.
	 */
	#emitText(raw: string, parent: Node) {
		if (this.#wsMode === "pre") {
			if (raw !== "") this.#appendText(raw, parent);
			this.#atBlockStart = false;
			this.#owed = false;
			return;
		}

		const collapsed = raw.replace(/[\t\n\r\f ]+/g, " ");
		if (collapsed === "") return;

		if (collapsed === " ") {
			// Pure inter-element whitespace: might be meaningful between two
			// inline elements, never meaningful at the start of a block.
			if (!this.#atBlockStart) this.#owed = true;
			return;
		}

		let value = collapsed;
		if (value.startsWith(" ")) {
			value = value.slice(1);
			if (!this.#atBlockStart) this.#owed = true;
		}
		let trailing = false;
		if (value.endsWith(" ")) {
			value = value.slice(0, -1);
			trailing = true;
		}
		if (this.#owed && !this.#atBlockStart) value = " " + value;

		this.#owed = trailing;
		this.#appendText(value, parent);
		this.#atBlockStart = false;
	}

	#appendText(value: string, parent: Node) {
		if (value === "") return;
		const last = parent.children[parent.children.length - 1];
		if (last?.tag === "core:text") {
			(last.data as { value: string }).value += value;
			return;
		}
		parent.children.push({ tag: "core:text", data: { value }, children: [], parent });
	}

	/**
	 * Emits a pending inter-element space into `parent` *before* an inline node
	 * opens.
	 *
	 * Without this the space in `<b>a</b> <i>b</i>` gets carried into the
	 * italic and comes out as `**a*** b*`. The owed space belongs to whoever
	 * contains both elements, not to the one that happens to be opening.
	 * Block tags are left alone - `#enterBlock` discards the space instead,
	 * which is what makes `<p>a</p> <p>b</p>` come out clean.
	 */
	#flushOwed(parent: Node, tag: TokenIdentifier) {
		if (BLOCK_TAGS.has(tag)) return;
		if (this.#owed && !this.#atBlockStart) this.#appendText(" ", parent);
		this.#owed = false;
		this.#atBlockStart = false;
	}

	#enterBlock(node: Node) {
		if (!BLOCK_TAGS.has(node.tag)) return;
		this.#owed = false;
		this.#atBlockStart = true;
	}

	#exitBlock(node: Node) {
		if (!BLOCK_TAGS.has(node.tag)) return;
		this.#owed = false;
		this.#atBlockStart = true;
	}

	/**
	 * Flattens a subtree to plain text with the same normalizer, but with
	 * freshly isolated state. Isolation is mandatory: flattening an `<a>` for
	 * its `data.text` must not leak the pending-space flag into the paragraph
	 * that contains it, or every link picks up a stray leading space.
	 */
	flattenText(el: XmlElement): string {
		const savedMode = this.#wsMode;
		const savedOwed = this.#owed;
		const savedStart = this.#atBlockStart;
		this.#owed = false;
		this.#atBlockStart = true;

		const sink: Node = { tag: "core:paragraph", data: {}, children: [] };
		const walk = (node: XmlNode) => {
			if (node.kind === "text" || node.kind === "cdata") {
				this.#emitText(node.value, sink);
				return;
			}
			if (node.kind === "element") { for (const child of node.children) walk(child); }
		};
		for (const child of el.children) walk(child);

		this.#wsMode = savedMode;
		this.#owed = savedOwed;
		this.#atBlockStart = savedStart;

		return sink.children
			.map((c) => (c.tag === "core:text" ? (c.data as { value: string }).value : ""))
			.join("")
			.trim();
	}

	/** Verbatim text of a subtree, for `<pre>` content. */
	rawText(el: XmlElement): string {
		let out = "";
		const walk = (node: XmlNode) => {
			if (node.kind === "text" || node.kind === "cdata") out += node.value;
			else if (node.kind === "element") { for (const child of node.children) walk(child); }
		};
		for (const child of el.children) walk(child);
		return out;
	}

	// ---- context ---------------------------------------------------------

	#ctx(el: XmlElement, parent: Node, ancestors: XmlElement[]): MatchContext {
		// deno-lint-ignore no-this-alias
		const self = this;
		const ctx: MatchContext = {
			el,
			ancestors,
			parent: ancestors[ancestors.length - 1],
			parentTag: parent.tag === ROOT_TAG ? undefined : parent.tag,
			get style() {
				return self.styleOf(el);
			},
			styleOf: (target) => self.styleOf(target),
			styleTable: this.#table,
			attr: (name, target) => lookupAttr(target ?? el, name),
			find: (localName, target) => findDescendant(target ?? el, localName),
			findAll: (localName, target) => findDescendants(target ?? el, localName),
			child: (localName, target) =>
				(target ?? el).children.find(
					(c): c is XmlElement => c.kind === "element" && c.name === localName,
				),
			text: (target) => self.flattenText(target ?? el),
			raw: (target) => self.rawText(target ?? el),
			crawlChildren: (node, target) => self.#visitChildren(target ?? el, node, ancestors),
			state: this.#state,
			warn: (message, target) => self.#opts.onWarn?.(message, target ?? el),
		};
		return ctx;
	}
}

function policyToResult(policy: UnmatchedPolicy): MatchResult {
	switch (policy) {
		case "raw":
			return { kind: "raw" };
		case "drop":
			return { kind: "drop" };
		default:
			return { kind: "unwrap" };
	}
}

function findDescendant(el: XmlElement, localName: string): XmlElement | undefined {
	for (const child of el.children) {
		if (child.kind !== "element") continue;
		if (child.name === localName) return child;
		const deeper = findDescendant(child, localName);
		if (deeper) return deeper;
	}
	return undefined;
}

function findDescendants(el: XmlElement, localName: string): XmlElement[] {
	const out: XmlElement[] = [];
	const walk = (node: XmlElement) => {
		for (const child of node.children) {
			if (child.kind !== "element") continue;
			if (child.name === localName) out.push(child);
			walk(child);
		}
	};
	walk(el);
	return out;
}

// ---- post-processing ------------------------------------------------------

/**
 * Three passes, in this order. Each fixes a shape that is legal in HTML but
 * unrepresentable - or wrongly represented - in markdown.
 */
export function postProcess(root: Node): Node {
	foldEmphasis(root);
	collapseSoleParagraphs(root);
	mergeAdjacentText(root);
	return root;
}

/**
 * `<strong><em>x</em></strong>` -> a single `md:bolditalic`.
 *
 * Without this, `***d***` comes back as `**_d_**`. That renders identically,
 * so it is cosmetic rather than semantic - but it is a real regression in
 * output quality and it is cheap to fix.
 */
function foldEmphasis(node: Node) {
	for (const child of node.children) foldEmphasis(child);

	if (node.tag !== "md:bold" && node.tag !== "md:italic") return;
	const inner = node.children;
	if (inner.length !== 1) return;
	const only = inner[0];
	const paired = node.tag === "md:bold" ? "md:italic" : "md:bold";
	if (only.tag !== paired) return;

	node.tag = "md:bolditalic";
	node.children = only.children;
	for (const grandchild of node.children) grandchild.parent = node;
}

/**
 * Unwraps a `core:paragraph` that is a list item's or line item's only
 * non-list child.
 *
 * `<li><p>x</p></li>` would otherwise serialize with a blank line inside the
 * item, which re-lexes as "the list ended". Mirror image of
 * `paragraphRule.renderOpen`'s existing collapse.
 */
function collapseSoleParagraphs(node: Node) {
	for (const child of node.children) collapseSoleParagraphs(child);
	if (!ITEM_TAGS.has(node.tag)) return;

	const lists = node.children.filter((c) => LIST_TAGS.has(c.tag));
	const rest = node.children.filter((c) => !LIST_TAGS.has(c.tag));
	if (rest.length !== 1 || rest[0].tag !== "core:paragraph") return;

	const inner = rest[0].children;
	for (const grandchild of inner) grandchild.parent = node;
	node.children = [...inner, ...lists];
}

/** Coalesces text nodes left adjacent by unwrapping. */
function mergeAdjacentText(node: Node) {
	const out: Node[] = [];
	for (const child of node.children) {
		mergeAdjacentText(child);
		const last = out[out.length - 1];
		if (child.tag === "core:text" && last?.tag === "core:text") {
			(last.data as { value: string }).value += (child.data as { value: string }).value;
			continue;
		}
		out.push(child);
	}
	node.children = out;
}
