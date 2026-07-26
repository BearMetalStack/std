/**
 * @module
 * A small declarative builder for reverse rules, so a profile reads as data
 * rather than as a pile of matcher closures.
 *
 * ```ts
 * on("h1").emit("md:heading", { level: 1 });
 * on("w:p").where(style(/^Heading\s*1$/i)).wrap("md:heading", { level: 1 });
 * onStyle((s) => s.bold).wrap("md:bold");
 * on(["w:sectPr", "w:proofErr"]).drop();
 * ```
 *
 * Rules produced here are `ReverseRule`s with ids in the `rev:` namespace, so
 * they never collide with a node tag and never need the forward contract's
 * `validate`/`tokenize`/`tree`/`renderOpen` stubs. Serialization for the tags
 * they emit comes from the matching forward rule in `defaultRules()`.
 */

import type {
	AnyReverseRule,
	MatchContext,
	MatchResult,
	Node,
	ResolvedStyle,
	TokenIdentifier,
} from "./types.ts";
import type { XmlElement } from "./xml/types.ts";

export type Matcher = (el: XmlElement, ctx: MatchContext) => boolean;
export type DataSpec =
	| Record<string, unknown>
	| ((el: XmlElement, ctx: MatchContext) => Record<string, unknown>);

let counter = 0;

// ---- free-function predicates ---------------------------------------------

/** Matches a named style by exact name or pattern. */
export function style(nameOrPattern: string | RegExp): Matcher {
	return (_el, ctx) => {
		const named = ctx.style.named;
		if (!named) return false;
		return typeof nameOrPattern === "string" ? named === nameOrPattern : nameOrPattern.test(named);
	};
}

/** Matches on any property of the resolved style. */
export function whereStyle(pred: (s: ResolvedStyle, ctx: MatchContext) => boolean): Matcher {
	return (_el, ctx) => pred(ctx.style, ctx);
}

/** Matches an attribute's presence, or its value against a string or pattern. */
export function attr(name: string, value?: string | RegExp): Matcher {
	return (el, ctx) => {
		const found = ctx.attr(name, el);
		if (found === undefined) return false;
		if (value === undefined) return true;
		return typeof value === "string" ? found === value : value.test(found);
	};
}

/** Matches an HTML class name. */
export function hasClass(name: string): Matcher {
	return (el) => (el.attrs.get("class") ?? "").split(/\s+/).includes(name);
}

/** Matches when a direct child with the given local name exists. */
export function hasChild(localName: string): Matcher {
	return (el, ctx) => ctx.child(localName, el) !== undefined;
}

/** Matches when some ancestor element has the given local name. */
export function hasAncestor(localName: string): Matcher {
	return (_el, ctx) => ctx.ancestors.some((a) => a.name === localName);
}

/** Matches on the clawmark tag of the enclosing emitted node. */
export function inside(tag: TokenIdentifier): Matcher {
	return (_el, ctx) => ctx.parentTag === tag;
}

/** Matches the element's namespace URI. */
export function ns(uri: string): Matcher {
	return (el) => el.ns === uri;
}

/** Matches the flattened text of the subtree. */
export function textMatches(pattern: RegExp): Matcher {
	return (el, ctx) => pattern.test(ctx.text(el));
}

export function not(matcher: Matcher): Matcher {
	return (el, ctx) => !matcher(el, ctx);
}

export function all(...matchers: Matcher[]): Matcher {
	return (el, ctx) => matchers.every((m) => m(el, ctx));
}

export function any(...matchers: Matcher[]): Matcher {
	return (el, ctx) => matchers.some((m) => m(el, ctx));
}

// ---- the builder ----------------------------------------------------------

export interface RuleBuilder {
	/** Adds predicates, ANDed with any already present. */
	where(...predicates: Matcher[]): RuleBuilder;
	whereStyle(pred: (s: ResolvedStyle, ctx: MatchContext) => boolean): RuleBuilder;
	whereAttr(name: string, value?: string | RegExp): RuleBuilder;
	whereNs(uri: string): RuleBuilder;
	whereAncestor(localName: string): RuleBuilder;
	whereChild(localName: string): RuleBuilder;
	whereNot(...predicates: Matcher[]): RuleBuilder;
	/** Overrides the generated `rev:` id, for readable debugging. */
	named(id: string): RuleBuilder;

	/**
	 * Emit a node and crawl the element's children into it. An array of tags
	 * opens a nested chain, outermost first; `data` lands on the outermost.
	 */
	wrap(tag: TokenIdentifier | TokenIdentifier[], data?: DataSpec): AnyReverseRule;
	/** Emit a childless node; the element's subtree is consumed. */
	emit(tag: TokenIdentifier, data?: DataSpec): AnyReverseRule;
	/** Emit several ready-built siblings. */
	nodes(build: (el: XmlElement, ctx: MatchContext) => Node[]): AnyReverseRule;
	unwrap(): AnyReverseRule;
	drop(): AnyReverseRule;
	raw(): AnyReverseRule;
	/** Full control; return null to decline. */
	to(fn: (el: XmlElement, ctx: MatchContext) => MatchResult | null): AnyReverseRule;
}

interface BuilderState {
	tags: string[];
	predicates: Matcher[];
	id?: string;
	nsMap?: Record<string, string>;
}

function build(state: BuilderState): RuleBuilder {
	const self: RuleBuilder = {
		where(...predicates) {
			state.predicates.push(...predicates);
			return self;
		},
		whereStyle(pred) {
			state.predicates.push(whereStyle(pred));
			return self;
		},
		whereAttr(name, value) {
			state.predicates.push(attr(name, value));
			return self;
		},
		whereNs(uri) {
			state.predicates.push(ns(uri));
			return self;
		},
		whereAncestor(localName) {
			state.predicates.push(hasAncestor(localName));
			return self;
		},
		whereChild(localName) {
			state.predicates.push(hasChild(localName));
			return self;
		},
		whereNot(...predicates) {
			state.predicates.push(not(all(...predicates)));
			return self;
		},
		named(id) {
			state.id = id;
			return self;
		},

		to: (fn) => finish(state, fn),
		wrap: (tag, data) =>
			finish(state, (el, ctx) => ({
				kind: "wrap",
				tag,
				data: resolveData(data, el, ctx),
			})),
		emit: (tag, data) =>
			finish(state, (el, ctx) => ({
				kind: "leaf",
				tag,
				data: resolveData(data, el, ctx),
			})),
		nodes: (buildNodes) =>
			finish(state, (el, ctx) => ({
				kind: "nodes",
				nodes: buildNodes(el, ctx),
			})),
		unwrap: () => finish(state, () => ({ kind: "unwrap" })),
		drop: () => finish(state, () => ({ kind: "drop" })),
		raw: () => finish(state, () => ({ kind: "raw" })),
	};
	return self;
}

function resolveData(
	data: DataSpec | undefined,
	el: XmlElement,
	ctx: MatchContext,
): Record<string, unknown> {
	if (data === undefined) return {};
	return typeof data === "function" ? data(el, ctx) : data;
}

function finish(
	state: BuilderState,
	produce: (el: XmlElement, ctx: MatchContext) => MatchResult | null,
): AnyReverseRule {
	const { tags, predicates } = state;
	const id = (state.id ?? `rev:${tags.join("-") || "any"}-${counter++}`) as TokenIdentifier;
	return {
		id,
		matchTag: tags.length > 0 ? tags : "*",
		match(el, ctx) {
			for (const predicate of predicates) {
				if (!predicate(el, ctx)) return null;
			}
			return produce(el, ctx);
		},
	};
}

/**
 * Starts a rule for one or more element names.
 *
 * A prefixed name (`"w:p"`) is split: the registry buckets on the local name,
 * and the prefix becomes a resolved-URI predicate when `nsMap` supplies a
 * binding. Buckets key on the local name because prefixes are not stable
 * across producers - a document is free to bind `w14:` or rebind `w:` - while
 * matching still checks the URI, which is.
 */
export function on(tag: string | string[], nsMap?: Record<string, string>): RuleBuilder {
	const raw = Array.isArray(tag) ? tag : [tag];
	const tags: string[] = [];
	const predicates: Matcher[] = [];
	const uris = new Set<string>();

	for (const name of raw) {
		const colon = name.indexOf(":");
		if (colon > 0) {
			const uri = nsMap?.[name.slice(0, colon)];
			if (uri) uris.add(uri);
			tags.push(name.slice(colon + 1));
		} else {
			tags.push(name);
		}
	}

	if (uris.size > 0) {
		const allowed = [...uris];
		// An element with no resolved namespace is accepted: docx and odt
		// fragments are routinely handed over without their root declarations,
		// and refusing those would make the profiles useless on real input.
		predicates.push((el) => el.ns === undefined || allowed.includes(el.ns));
	}

	return build({ tags, predicates, nsMap });
}

/** Starts a rule consulted for every element, whatever its name. */
export function onAny(): RuleBuilder {
	return build({ tags: [], predicates: [] });
}

/** Sugar for `onAny().whereStyle(pred)`. */
export function onStyle(pred: (s: ResolvedStyle, ctx: MatchContext) => boolean): RuleBuilder {
	return onAny().whereStyle(pred);
}

/** Binds `on` to a namespace map, so a profile can write `on("w:p")` throughout. */
export function scopedOn(nsMap: Record<string, string>): (tag: string | string[]) => RuleBuilder {
	return (tag) => on(tag, nsMap);
}
