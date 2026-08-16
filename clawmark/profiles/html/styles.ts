import type { ResolvedStyle, StyleResolver } from "../../types.ts";
import type { XmlElement } from "../../xml/types.ts";
import { parseDeclarations } from "../../css.ts";
import { isBoldWeight } from "../../format.ts";

/**
 * Parses an inline `style="..."` attribute into a property map.
 *
 * An alias for the stylesheet parser's declaration reader - an inline style
 * attribute *is* a declaration block, and having two parsers for it meant a
 * `font-family: "Foo, Bar", serif` split at the comma in one and not the other.
 */
export const parseInlineStyle: (value: string | undefined) => Map<string, string> =
	parseDeclarations;

/**
 * Word's HTML export writes list structure into CSS rather than into
 * `<ul>`/`<li>`, and tags nearly everything with an `Mso*` class. Without
 * these two lookups, an exported document degrades into an undifferentiated
 * run of paragraphs - which is most of what this resolver exists to prevent.
 */
const MSO_CLASSES: Record<string, ResolvedStyle> = {
	msonormal: { blockRole: "paragraph" },
	msolistparagraph: { blockRole: "list" },
	msolistparagraphcxspfirst: { blockRole: "list" },
	msolistparagraphcxspmiddle: { blockRole: "list" },
	msolistparagraphcxsplast: { blockRole: "list" },
	msoquote: { blockRole: "quote" },
	msointensequote: { blockRole: "quote" },
	msotitle: { blockRole: "heading", headingLevel: 1 },
	msoheading1: { blockRole: "heading", headingLevel: 1 },
	msoheading2: { blockRole: "heading", headingLevel: 2 },
	msoheading3: { blockRole: "heading", headingLevel: 3 },
	msoheading4: { blockRole: "heading", headingLevel: 4 },
	msoheading5: { blockRole: "heading", headingLevel: 5 },
	msoheading6: { blockRole: "heading", headingLevel: 6 },
};

const MONO_RX = /mono|courier|consolas|menlo|monaco/i;
const TRANSPARENT_RX = /^(transparent|#fff(fff)?|white|rgba?\(\s*255\s*,\s*255\s*,\s*255)/i;

export interface HtmlStyleOptions {
	/** Extra class-name to style mappings, merged over the built-in Mso set. */
	classMap?: Record<string, ResolvedStyle>;
}

/**
 * Style resolver for HTML. Semantic tags carry most of the meaning, so this
 * mainly exists to recover formatting from inline CSS and class names - which
 * is what pasted-from-Word HTML actually looks like.
 */
export function htmlStyleResolver(options: HtmlStyleOptions = {}): StyleResolver {
	const classMap = { ...MSO_CLASSES, ...(options.classMap ?? {}) };

	return {
		own(el: XmlElement): ResolvedStyle {
			const out: ResolvedStyle = {};

			for (const raw of (el.attrs.get("class") ?? "").split(/\s+/)) {
				const hit = classMap[raw.toLowerCase()];
				if (hit) Object.assign(out, hit);
			}

			const css = parseInlineStyle(el.attrs.get("style"));
			if (css.size > 0) {
				const weight = css.get("font-weight");
				if (weight) out.bold = isBoldWeight(weight);

				const fontStyle = css.get("font-style");
				if (fontStyle) out.italic = /^(italic|oblique)/i.test(fontStyle);

				const decoration = css.get("text-decoration") ?? css.get("text-decoration-line");
				if (decoration) out.strike = /line-through/i.test(decoration);

				const family = css.get("font-family");
				if (family) out.mono = MONO_RX.test(family);

				const background = css.get("background-color") ?? css.get("background");
				if (background) out.highlight = !TRANSPARENT_RX.test(background.trim());

				const align = css.get("text-align");
				if (align === "center") out.align = "c";
				else if (align === "right") out.align = "r";
				else if (align === "left") out.align = "l";
				else if (align === "justify") out.align = "j";

				// Word puts list structure in CSS, not in markup.
				const msoList = css.get("mso-list");
				if (msoList) {
					const level = /level(\d+)/i.exec(msoList)?.[1];
					out.list = {
						kind: "unordered",
						level: level ? Number(level) - 1 : 0,
					};
					out.blockRole = "list";
				}
			}

			return out;
		},
	};
}
