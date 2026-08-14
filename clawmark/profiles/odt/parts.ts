/**
 * @module
 * The parts of an `.odt` that are boilerplate rather than content.
 *
 * The common style names here are the ones `styleFromName()` in style.ts
 * recognizes, via their `style:display-name` - ODF encodes spaces in a
 * `style:name` as `_20_`, so the two spellings of every multi-word style have
 * to stay in sync. Changing a display name without changing that function
 * breaks the round trip silently.
 */

import type { DocumentStyles, ResolvedStyle, StyleBlock, StyleDef } from "../../types.ts";
import { el, XML_DECL } from "../../xml/build.ts";
import { serializeXml } from "../../xml/serialize.ts";
import type { AttrMap, XmlElement } from "../../xml/types.ts";
import { basePoints, isBoldWeight, parseLength, toOdfLength } from "../../format.ts";

export const MIMETYPE = "application/vnd.oasis.opendocument.text";
export const ODF_VERSION = "1.3";

const MANIFEST_NS = "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0";
const META_NS = "urn:oasis:names:tc:opendocument:xmlns:meta:1.0";
const DC_NS = "http://purl.org/dc/elements/1.1/";

/** Namespaces declared on the roots of `content.xml` and `styles.xml`. */
export const ODT_WRITE_NS: Record<string, string> = {
	office: "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
	style: "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
	text: "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
	table: "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
	draw: "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0",
	fo: "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
	svg: "urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0",
	xlink: "http://www.w3.org/1999/xlink",
};

/**
 * `META-INF/manifest.xml`.
 *
 * The `/` entry carries the package media type; without it a consumer has only
 * the `mimetype` entry to go on, and some refuse the file outright.
 */
export function manifest(): string {
	const entries = ["content.xml", "styles.xml", "meta.xml"]
		.map((path) =>
			`\t<manifest:file-entry manifest:full-path="${path}" manifest:media-type="text/xml"/>`
		)
		.join("\n");
	return `${XML_DECL}<manifest:manifest xmlns:manifest="${MANIFEST_NS}" manifest:version="${ODF_VERSION}">
\t<manifest:file-entry manifest:full-path="/" manifest:version="${ODF_VERSION}" manifest:media-type="${MIMETYPE}"/>
${entries}
</manifest:manifest>
`;
}

export function meta(generator: string): string {
	return `${XML_DECL}<office:document-meta xmlns:office="${ODT_WRITE_NS.office}" xmlns:meta="${META_NS}" xmlns:dc="${DC_NS}" office:version="${ODF_VERSION}">
\t<office:meta><meta:generator>${generator}</meta:generator></office:meta>
</office:document-meta>
`;
}

const HEADING_SIZES = ["24pt", "20pt", "16pt", "14pt", "13pt", "12pt"];

/**
 * `styles.xml` - the common styles the body references by name.
 *
 * Note the absence of `fo:font-weight` on the heading styles. Character
 * properties on a paragraph style cascade to the text inside it, and the
 * reader cannot tell "bold because it is a heading" from "bold because the
 * author said so" - a bold heading style reads back as `# **Heading**`. Size
 * alone carries the distinction. Same reason `Quote` is an indent, not an
 * italic.
 */
export interface StylesPartOptions {
	monoFont: string;
	/** Caller-defined styles, emitted alongside (or over) the built-ins. */
	styles?: DocumentStyles;
}

export function stylesPart(options: StylesPartOptions | string): string {
	const opts: StylesPartOptions = typeof options === "string" ? { monoFont: options } : options;
	const monoFont = opts.monoFont;

	// Keyed by style name so a caller-registered style displaces the built-in
	// it collides with - restyling `Quote` for one novel should not require
	// forking the writer.
	const defs = new Map<string, string>([
		["Standard", `\t\t<style:style style:name="Standard" style:family="paragraph"/>`],
	]);
	HEADING_SIZES.forEach((size, index) => {
		const level = index + 1;
		defs.set(
			`Heading_20_${level}`,
			`\t\t<style:style style:name="Heading_20_${level}" style:display-name="Heading ${level}" style:family="paragraph" style:parent-style-name="Standard" style:default-outline-level="${level}">
\t\t\t<style:text-properties fo:font-size="${size}"/>
\t\t</style:style>`,
		);
	});
	defs.set(
		"Quote",
		`\t\t<style:style style:name="Quote" style:family="paragraph" style:parent-style-name="Standard">
\t\t\t<style:paragraph-properties fo:margin-left="1cm" fo:margin-right="1cm"/>
\t\t</style:style>`,
	);
	defs.set(
		"Preformatted_20_Text",
		`\t\t<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard">
\t\t\t<style:text-properties style:font-name="${monoFont}" fo:font-family="${monoFont}"/>
\t\t</style:style>`,
	);
	defs.set(
		"Horizontal_20_Line",
		`\t\t<style:style style:name="Horizontal_20_Line" style:display-name="Horizontal Line" style:family="paragraph" style:parent-style-name="Standard">
\t\t\t<style:paragraph-properties fo:border-bottom="0.06pt solid #000000" fo:padding-bottom="0.04cm"/>
\t\t</style:style>`,
	);

	for (const [name] of opts.styles?.entries ?? []) {
		defs.set(opts.styles!.idFor(name), odtStyle(name, opts.styles!));
	}

	return `${XML_DECL}<office:document-styles ${nsAttrs()} office:version="${ODF_VERSION}">
\t<office:styles>
${[...defs.values()].join("\n")}
\t</office:styles>
</office:document-styles>
`;
}

// ---- caller-defined styles ------------------------------------------------

const ODF_TRANSFORM: Record<string, string | undefined> = {
	none: "none",
	uppercase: "uppercase",
	lowercase: "lowercase",
	capitalize: "capitalize",
};

/**
 * `<style:paragraph-properties>` for a caller-defined style.
 *
 * ODF is far more forgiving about ordering than OOXML is - these are attributes
 * on one element rather than a schema sequence of child elements - but the
 * *elements* still have an order: paragraph properties precede text properties,
 * and a reader that validates will reject the reverse.
 */
function odtParagraphProperties(block: StyleBlock, basePt: number): XmlElement | undefined {
	const attrs: AttrMap = {};
	const length = (value: string | undefined) => toOdfLength(parseLength(value), basePt);

	if (block.align) attrs["fo:text-align"] = ODF_ALIGN[block.align];
	attrs["fo:margin-top"] = length(block.spaceBefore);
	attrs["fo:margin-bottom"] = length(block.spaceAfter);
	attrs["fo:margin-left"] = length(block.indentLeft);
	attrs["fo:margin-right"] = length(block.indentRight);
	attrs["fo:text-indent"] = length(block.textIndent);
	if (block.breakBefore) attrs["fo:break-before"] = block.breakBefore;
	if (block.breakAfter) attrs["fo:break-after"] = block.breakAfter;
	if (block.keepWithNext) attrs["fo:keep-with-next"] = "always";
	if (block.keepTogether) attrs["style:keep-together"] = "always";
	if (block.widowControl !== undefined) {
		attrs["fo:widows"] = block.widowControl ? "2" : "0";
		attrs["fo:orphans"] = block.widowControl ? "2" : "0";
	}
	if (typeof block.lineHeight === "number") {
		// ODF has no unitless line height; the equivalent is a percentage of
		// single spacing, which is what a unitless CSS value already means.
		attrs["fo:line-height"] = `${Math.round(block.lineHeight * 100)}%`;
	} else if (block.lineHeight !== undefined) {
		attrs["fo:line-height"] = length(block.lineHeight);
	}
	if (block.background) attrs["fo:background-color"] = block.background;

	const props = el("style:paragraph-properties", attrs);
	return props.attrs.size === 0 ? undefined : props;
}

/** `<style:text-properties>` for a caller-defined style. */
function odtTextProperties(block: StyleBlock, basePt: number): XmlElement | undefined {
	const attrs: AttrMap = {};
	const length = (value: string | undefined) => toOdfLength(parseLength(value), basePt);

	if (block.fontFamily) {
		attrs["style:font-name"] = primaryFont(block.fontFamily);
		attrs["fo:font-family"] = block.fontFamily;
	}
	attrs["fo:font-size"] = length(block.fontSize);
	if (block.fontWeight !== undefined) {
		attrs["fo:font-weight"] = isBoldWeight(block.fontWeight) ? "bold" : "normal";
	}
	if (block.fontStyle !== undefined) attrs["fo:font-style"] = block.fontStyle;
	if (block.color) attrs["fo:color"] = block.color;
	if (block.smallCaps !== undefined) {
		attrs["fo:font-variant"] = block.smallCaps ? "small-caps" : "normal";
	}
	if (block.textTransform && ODF_TRANSFORM[block.textTransform]) {
		attrs["fo:text-transform"] = ODF_TRANSFORM[block.textTransform];
	}
	attrs["fo:letter-spacing"] = length(block.letterSpacing);
	if (block.underline !== undefined) {
		attrs["style:text-underline-style"] = block.underline ? "solid" : "none";
	}
	if (block.strike !== undefined) {
		attrs["style:text-line-through-style"] = block.strike ? "solid" : "none";
	}
	// A character style carries its background on the text properties; a
	// paragraph style carries it on the paragraph properties instead.
	if (block.background && block.family === "text") {
		attrs["fo:background-color"] = block.background;
	}

	const props = el("style:text-properties", attrs);
	return props.attrs.size === 0 ? undefined : props;
}

/**
 * The first family in a CSS font stack, unquoted.
 *
 * `style:font-name` names one font; `fo:font-family` keeps the whole stack, so
 * nothing is lost - a reader that understands only one of the two still gets an
 * answer.
 */
function primaryFont(stack: string): string {
	return stack.split(",")[0].trim().replace(/^["']|["']$/g, "");
}

/** One caller-defined style, as a serialized `<style:style>`. */
export function odtStyle(name: string, styles: DocumentStyles): string {
	const block = styles.resolve(name);
	const basePt = basePoints(styles);
	const id = styles.idFor(name);
	const family = block.family === "text" ? "text" : "paragraph";

	const attrs: AttrMap = { "style:name": id, "style:family": family };
	const display = block.displayName ?? name;
	if (display !== id) attrs["style:display-name"] = display;
	attrs["style:parent-style-name"] = block.basedOn
		? styles.idFor(block.basedOn)
		: family === "paragraph"
		? "Standard"
		: undefined;
	if (block.nextStyle) attrs["style:next-style-name"] = styles.idFor(block.nextStyle);
	if (block.headingLevel !== undefined) {
		attrs["style:default-outline-level"] = block.headingLevel;
	}

	const children: XmlElement[] = [];
	// A text-family style has no paragraph half; writing one makes LibreOffice
	// discard the whole definition.
	if (family === "paragraph") {
		const paragraph = odtParagraphProperties(block, basePt);
		if (paragraph) children.push(paragraph);
	}
	const text = odtTextProperties(block, basePt);
	if (text) children.push(text);

	return `\t\t${serializeXml(el("style:style", attrs, children))}`;
}

export function nsAttrs(): string {
	return Object.entries(ODT_WRITE_NS)
		.map(([prefix, uri]) => `xmlns:${prefix}="${uri}"`)
		.join(" ");
}

const ORDERED_FORMATS = ["1", "a", "i"];
const BULLET_CHARS = ["•", "◦", "▪"];

/**
 * A `<text:list-style>` for one list kind, with all ten levels defined.
 *
 * Every level of a given style is the same kind on purpose. The reader looks a
 * list's kind up per nesting level and falls back to level 1, so a
 * single-kind style answers correctly at any depth - which is what lets the
 * writer hand a nested list of the *other* kind its own style rather than
 * trying to describe both in one.
 */
export function listStyle(name: string, kind: "ordered" | "unordered"): string {
	const levels: string[] = [];
	for (let level = 1; level <= 10; level++) {
		const indent = `${1.27 * level}cm`;
		const properties =
			`<style:list-level-properties text:space-before="${indent}" text:min-label-width="0.635cm"/>`;
		levels.push(
			kind === "ordered"
				? `\t\t<text:list-level-style-number text:level="${level}" style:num-suffix="." style:num-format="${
					ORDERED_FORMATS[(level - 1) % ORDERED_FORMATS.length]
				}" text:start-value="1">${properties}</text:list-level-style-number>`
				: `\t\t<text:list-level-style-bullet text:level="${level}" text:bullet-char="${
					BULLET_CHARS[(level - 1) % BULLET_CHARS.length]
				}">${properties}</text:list-level-style-bullet>`,
		);
	}
	return `\t<text:list-style style:name="${name}">\n${levels.join("\n")}\n\t</text:list-style>`;
}

const ODF_ALIGN: Record<NonNullable<ResolvedStyle["align"]>, string> = {
	l: "start",
	c: "center",
	r: "end",
	j: "justify",
};

/**
 * `<style:style style:family="paragraph">` for one interned automatic style.
 *
 * ODF has no element for a page break: a break is a *property* of the paragraph
 * that follows (or precedes) it, carried by an automatic paragraph style that
 * derives from a common one. That indirection is why interning paragraph styles
 * has to work at all - see `paragraphStyleName()` in write.ts, which is this
 * function's other half.
 */
export function paragraphStyle(def: StyleDef): string {
	const style = def.style;
	const props: string[] = [];
	if (style.breakBefore) props.push(`fo:break-before="${style.breakBefore}"`);
	if (style.breakAfter) props.push(`fo:break-after="${style.breakAfter}"`);
	if (style.align) props.push(`fo:text-align="${ODF_ALIGN[style.align]}"`);

	const parent = def.basedOn ? ` style:parent-style-name="${def.basedOn}"` : "";
	return `\t<style:style style:name="${def.id}" style:family="paragraph"${parent}>\n\t\t<style:paragraph-properties ${
		props.join(" ")
	}/>\n\t</style:style>`;
}

/**
 * `<style:style style:family="text">` for one interned automatic style.
 *
 * The property names are exactly the ones `textProperties()` in the read
 * profile looks for; this function and that one are a matched pair.
 */
export function textStyle(def: StyleDef, monoFont: string): string {
	const style = def.style;
	const props: string[] = [];
	// An automatic text style derives from a common one when the run carries a
	// named character style *and* direct formatting on top of it - without the
	// parent, the named style's own formatting is lost at that run.
	const parent = def.basedOn ? ` style:parent-style-name="${def.basedOn}"` : "";
	if (style.bold !== undefined) props.push(`fo:font-weight="${style.bold ? "bold" : "normal"}"`);
	if (style.italic !== undefined) {
		props.push(`fo:font-style="${style.italic ? "italic" : "normal"}"`);
	}
	if (style.strike !== undefined) {
		props.push(`style:text-line-through-style="${style.strike ? "solid" : "none"}"`);
	}
	if (style.underline !== undefined) {
		props.push(`style:text-underline-style="${style.underline ? "solid" : "none"}"`);
	}
	if (style.highlight) props.push(`fo:background-color="#ffff00"`);
	if (style.mono) props.push(`style:font-name="${monoFont}" fo:font-family="${monoFont}"`);
	return `\t<style:style style:name="${def.id}" style:family="text"${parent}>\n\t\t<style:text-properties ${
		props.join(" ")
	}/>\n\t</style:style>`;
}
