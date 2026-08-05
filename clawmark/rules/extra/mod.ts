/**
 * @module
 * Opt-in rules for constructs markdown has no agreed syntax for.
 *
 * Nothing here is in `defaultRules()`. These cover things every *target* format
 * can express but no two markdown dialects spell the same way, so clawmark owns
 * the node tag and the writers, and the caller picks the syntax:
 *
 * ```ts
 * const rules = [...pageBreakRules({ markers: "+++" }), ...defaultRules()];
 * const out = markdownWith(source, odtWriter(), rules);
 * ```
 *
 * Owning the tag centrally is the point. A rule pack that invents its own
 * `x:pagebreak` gets no writer support and has to reimplement the ODF automatic
 * style and the docx break run itself; emitting `md:pagebreak` gets both for
 * free, plus HTML rendering and markdown round-tripping.
 */

import type { AnyRule, BreakKind, Rule, TokenIdentifier } from "../../types.ts";
import { appendLeaf, consumeRestOfLine } from "../helpers.ts";
import { addBlockTags } from "../paragraph.ts";

/** The node tag every break construct in this module emits. */
export const PAGE_BREAK_TAG: TokenIdentifier = "md:pagebreak";

/** `data` on an `md:pagebreak` node. */
export interface PageBreakData {
	kind: BreakKind;
}

export interface PageBreakOptions {
	/**
	 * Line content that means "break here". A marker must be the entire line,
	 * trailing whitespace aside. Default `["\\pagebreak", "\\newpage"]` - the
	 * LaTeX spellings pandoc understands.
	 */
	markers?: string | string[];
	/** Marker the markdown serializer writes back out. Default: the first one. */
	marker?: string;
	/** Default "page". */
	kind?: BreakKind;
	/** `class` on the rendered HTML element. Default "pagebreak". */
	className?: string;
}

const CSS: Record<BreakKind, string> = {
	page: "break-after:page;page-break-after:always",
	column: "break-after:column;-webkit-column-break-after:always",
};

/**
 * The break kind a node carries, defaulting to "page".
 *
 * Takes the structural minimum rather than `Node`, so it accepts both a
 * `Node<PageBreakData>` from this module's own rules and the erased `Node` the
 * writers hand their emitters.
 */
export function breakKind(node: { data: unknown }): BreakKind {
	const kind = (node.data as Partial<PageBreakData> | undefined)?.kind;
	return kind === "column" ? "column" : "page";
}

function normalizeMarkers(markers: PageBreakOptions["markers"]): string[] {
	const list = markers === undefined
		? ["\\pagebreak", "\\newpage"]
		: Array.isArray(markers)
		? markers
		: [markers];
	const out = list.filter((marker) => marker.length > 0);
	if (out.length === 0) {
		throw new Error("pageBreakRules: at least one non-empty marker is required");
	}
	return out;
}

/**
 * Rules for a hard break between pages (or columns).
 *
 * Returns one `Rule` per distinct leading character across `markers`, because a
 * `Rule` has exactly one `trigger`. They all share the `md:pagebreak` id, which
 * is deliberate and safe: `TreeBuilder` and `Renderer` index rules by id and
 * keep the last, and these are behaviorally identical past `validate`.
 *
 * Registers `md:pagebreak` as block-level as a side effect, so the lexer's
 * automatic paragraph wrapper collapses around it instead of leaving the break
 * *inside* a paragraph - which is invalid in ODF and meaningless in HTML.
 */
export function pageBreakRules(options: PageBreakOptions = {}): AnyRule[] {
	const markers = normalizeMarkers(options.markers);
	const kind = options.kind ?? "page";
	const canonical = options.marker ?? markers[0];
	const className = options.className ?? "pagebreak";

	addBlockTags(PAGE_BREAK_TAG);

	const byTrigger = new Map<string, string[]>();
	for (const marker of markers) {
		const list = byTrigger.get(marker[0]) ?? [];
		list.push(marker);
		byTrigger.set(marker[0], list);
	}

	return [...byTrigger].map(([trigger, group]) => {
		const rule: Rule<PageBreakData> = {
			id: PAGE_BREAK_TAG,
			trigger,
			validate: (ctx) => ctx.cursor === ctx.lineStart && group.includes(ctx.currentLine.trimEnd()),

			tokenize(ctx) {
				consumeRestOfLine(ctx);
				return { tag: PAGE_BREAK_TAG, data: { kind } };
			},

			tree: (token, ctx) => appendLeaf(ctx, PAGE_BREAK_TAG, token.data),

			renderOpen: (node) => `<div class="${className}" style="${CSS[breakKind(node)]}"></div>`,

			matchTag: "div",
			match: (el) =>
				(el.attrs.get("class") ?? "").split(/\s+/).includes(className)
					? { kind: "leaf", tag: PAGE_BREAK_TAG, data: { kind } }
					: null,

			serializeKind: "block",
			serialize: () => canonical,
		};
		return rule as AnyRule;
	});
}
