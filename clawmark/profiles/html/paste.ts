/**
 * @module
 * Rules for the HTML that editors and word processors put on the clipboard,
 * where formatting is often written in CSS rather than in tags, and where a
 * contenteditable pads empty blocks with a `<br>`.
 */

import type { AnyReverseRule, MatchContext, StyleResolver, TokenIdentifier } from "../../types.ts";
import type { XmlElement, XmlNode } from "../../xml/types.ts";

type Format = "bold" | "italic" | "strike" | "underline";

const FORMATS: [Format, TokenIdentifier][] = [
	["bold", "md:bold"],
	["italic", "md:italic"],
	["strike", "md:strikethrough"],
	["underline", "md:underline"],
];

/** The formatting a tag means on its own, before any CSS. */
const TAG_FORMAT: Record<string, Format> = {
	b: "bold",
	strong: "bold",
	i: "italic",
	em: "italic",
	s: "strike",
	del: "strike",
	strike: "strike",
	u: "underline",
	ins: "underline",
};

/** Whether `el` itself turns `format` on or off, by its tag or its own CSS. */
function ownFormat(
	el: XmlElement,
	format: Format,
	styles: StyleResolver,
	ctx: MatchContext,
): boolean | undefined {
	const css = styles.own(el, ctx.styleTable)[format];
	if (css !== undefined) return css;
	return TAG_FORMAT[el.name] === format ? true : undefined;
}

/** Whether `format` is already in effect where `el` sits, from its nearest ancestor that says. */
function inherited(ctx: MatchContext, format: Format, styles: StyleResolver): boolean {
	for (let i = ctx.ancestors.length - 1; i >= 0; i--) {
		const value = ownFormat(ctx.ancestors[i], format, styles, ctx);
		if (value !== undefined) return value;
	}
	return false;
}

/**
 * A `<span>` that formats in CSS: Google Docs writes bold as
 * `<span style="font-weight:700">`, and Word does much the same. Only what the
 * span adds is wrapped, so a bold span inside `<b>` does not become `****`.
 */
export function styledSpanRule(styles: StyleResolver): AnyReverseRule {
	return {
		id: "html:styled-span",
		matchTag: "span",
		match: (el, ctx) => {
			const tags = FORMATS
				.filter(([format]) =>
					styles.own(el, ctx.styleTable)[format] === true && !inherited(ctx, format, styles)
				)
				.map(([, tag]) => tag);
			return tags.length > 0 ? { kind: "wrap", tag: tags } : null;
		},
	};
}

/**
 * A formatting tag whose own CSS turns its formatting off. Google Docs wraps a
 * whole clipboard payload in `<b style="font-weight:normal">`, which read as a
 * tag makes everything pasted bold.
 */
export function negatedFormatRule(styles: StyleResolver): AnyReverseRule {
	return {
		id: "html:negated-format",
		matchTag: Object.keys(TAG_FORMAT),
		match: (el, ctx) =>
			styles.own(el, ctx.styleTable)[TAG_FORMAT[el.name]] === false ? { kind: "unwrap" } : null,
	};
}

/** Elements a trailing `<br>` can sit inside and still be at the end of its block. */
const INLINE = new Set([
	...Object.keys(TAG_FORMAT),
	"a",
	"span",
	"font",
	"small",
	"big",
	"code",
	"mark",
	"sub",
	"sup",
	"abbr",
	"cite",
	"q",
	"time",
	"label",
]);

function isBlankText(node: XmlNode): boolean {
	return (node.kind === "text" || node.kind === "comment") && node.value.trim() === "";
}

/**
 * The `<br>` a browser puts at the end of a block to give it height. A
 * contenteditable cannot show, or put a caret in, an empty block, so every
 * engine pads one; read back as `md:linebreak` it would serialize to a stray
 * hard break. Only a `<br>` with nothing but whitespace after it before its
 * block ends is dropped, so a line break mid-block survives.
 */
export const fillerBreakRule: AnyReverseRule = {
	id: "html:filler-break",
	matchTag: "br",
	match: (el, ctx) => {
		let node: XmlElement = el;
		for (let i = ctx.ancestors.length - 1; i >= 0; i--) {
			const parent = ctx.ancestors[i];
			const after = parent.children.slice(parent.children.indexOf(node) + 1);
			if (!after.every(isBlankText)) return null;
			if (!INLINE.has(parent.name)) return { kind: "drop" };
			node = parent;
		}
		return null;
	},
};
