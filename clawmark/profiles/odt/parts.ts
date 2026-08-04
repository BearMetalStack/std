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

import type { StyleDef } from "../../types.ts";
import { XML_DECL } from "../../xml/build.ts";

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
export function stylesPart(monoFont: string): string {
	const headings = HEADING_SIZES.map((size, index) => {
		const level = index + 1;
		return `\t\t<style:style style:name="Heading_20_${level}" style:display-name="Heading ${level}" style:family="paragraph" style:parent-style-name="Standard" style:default-outline-level="${level}">
\t\t\t<style:text-properties fo:font-size="${size}"/>
\t\t</style:style>`;
	}).join("\n");

	return `${XML_DECL}<office:document-styles ${nsAttrs()} office:version="${ODF_VERSION}">
\t<office:styles>
\t\t<style:style style:name="Standard" style:family="paragraph"/>
${headings}
\t\t<style:style style:name="Quote" style:family="paragraph" style:parent-style-name="Standard">
\t\t\t<style:paragraph-properties fo:margin-left="1cm" fo:margin-right="1cm"/>
\t\t</style:style>
\t\t<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard">
\t\t\t<style:text-properties style:font-name="${monoFont}" fo:font-family="${monoFont}"/>
\t\t</style:style>
\t\t<style:style style:name="Horizontal_20_Line" style:display-name="Horizontal Line" style:family="paragraph" style:parent-style-name="Standard">
\t\t\t<style:paragraph-properties fo:border-bottom="0.06pt solid #000000" fo:padding-bottom="0.04cm"/>
\t\t</style:style>
\t</office:styles>
</office:document-styles>
`;
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

const ODF_ALIGN: Record<"l" | "c" | "r", string> = { l: "start", c: "center", r: "end" };

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
	return `\t<style:style style:name="${def.id}" style:family="text">\n\t\t<style:text-properties ${
		props.join(" ")
	}/>\n\t</style:style>`;
}
