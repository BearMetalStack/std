/**
 * @module
 * The parts of a `.docx` that are boilerplate rather than content.
 *
 * The fixed parts are template strings rather than `el()` trees on purpose:
 * nothing in them varies with the document except the two loops at the bottom,
 * and a literal is both shorter and far easier to check against the spec than
 * the builder calls that would produce it.
 *
 * Caller-defined styles are the exception and go through `el()`, because they
 * interpolate values this module did not write - a font name or a color from
 * someone's stylesheet - and a template string would need `escapeAttr` at every
 * one of them, which is exactly the kind of thing that gets forgotten once.
 *
 * The style ids here are the ones `styleFromName()` in style.ts already
 * recognizes, so a document written by this profile reads back correctly even
 * when the caller never hands `styles.xml` to `docxProfile()`. Changing an id
 * or a `w:name` without changing that function breaks the round trip silently.
 */

import type { DocumentStyles, ResourceEntry, StyleBlock } from "../../types.ts";
import { el, XML_DECL } from "../../xml/build.ts";
import { serializeXml } from "../../xml/serialize.ts";
import type { AttrMap, XmlElement } from "../../xml/types.ts";
import {
	basePoints,
	isBoldWeight,
	parseLength,
	toHalfPoints,
	toHexColor,
	toTwips,
} from "../../format.ts";

/**
 * Relationship *type* URIs live under `officeDocument`, but the XML namespaces
 * of the package-level parts (`[Content_Types].xml` and every `.rels`) live
 * under `package` - ECMA-376 Part 2. Conflating the two produces a package
 * that is well-formed XML and passes a casual read, but whose content types
 * no consumer can resolve: Word and LibreOffice both fail to detect the file
 * as OOXML at all and refuse to open it, while more forgiving readers
 * (OpenOffice) fall back to the file extension and appear to work.
 */
const PKG_BASE = "http://schemas.openxmlformats.org/package/2006";
const REL_BASE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** Relationship type URIs, keyed by the part they point at. */
export const REL_TYPE = {
	document: `${REL_BASE}/officeDocument`,
	styles: `${REL_BASE}/styles`,
	numbering: `${REL_BASE}/numbering`,
	footnotes: `${REL_BASE}/footnotes`,
	hyperlink: `${REL_BASE}/hyperlink`,
	image: `${REL_BASE}/image`,
} as const;

function escapeAttr(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

export function contentTypes(options: { footnotes: boolean }): string {
	const footnotes = options.footnotes
		? `\n\t<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>`
		: "";
	return `${XML_DECL}<Types xmlns="${PKG_BASE}/content-types">
\t<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
\t<Default Extension="xml" ContentType="application/xml"/>
\t<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
\t<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
\t<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>${footnotes}
</Types>
`;
}

export function packageRels(): string {
	return `${XML_DECL}<Relationships xmlns="${PKG_BASE}/relationships">
\t<Relationship Id="rIdDoc" Type="${REL_TYPE.document}" Target="word/document.xml"/>
</Relationships>
`;
}

/**
 * `word/_rels/document.xml.rels`.
 *
 * The fixed parts take ids after everything the `ResourceSink` handed out, so
 * a hyperlink's `r:id` in the body always matches its entry here - the sink
 * numbers from `rId1` during the emit pass, and this runs afterwards.
 */
export function documentRels(entries: readonly ResourceEntry[], footnotes: boolean): string {
	const lines: string[] = [];
	for (const entry of entries) {
		const type = entry.type === "image" ? REL_TYPE.image : REL_TYPE.hyperlink;
		const mode = entry.external ? ' TargetMode="External"' : "";
		lines.push(
			`\t<Relationship Id="${entry.id}" Type="${type}" Target="${
				escapeAttr(entry.target)
			}"${mode}/>`,
		);
	}
	let next = entries.length + 1;
	lines.push(`\t<Relationship Id="rId${next++}" Type="${REL_TYPE.styles}" Target="styles.xml"/>`);
	lines.push(
		`\t<Relationship Id="rId${next++}" Type="${REL_TYPE.numbering}" Target="numbering.xml"/>`,
	);
	if (footnotes) {
		lines.push(
			`\t<Relationship Id="rId${next++}" Type="${REL_TYPE.footnotes}" Target="footnotes.xml"/>`,
		);
	}
	return `${XML_DECL}<Relationships xmlns="${PKG_BASE}/relationships">
${lines.join("\n")}
</Relationships>
`;
}

const HEADING_SIZES = [32, 28, 26, 24, 22, 20];

/**
 * Headings are distinguished by size alone - deliberately no `<w:b/>`.
 *
 * Character properties on a paragraph style cascade to the runs inside it
 * (`DEFAULT_INHERITS` in style.ts), and the reader has no way to tell "bold
 * because it is a heading" from "bold because the author bolded it". A heading
 * style carrying `<w:b/>` therefore reads back as `# **Heading**`, and the
 * round trip stops being a fixed point. Same reason `Quote` below carries an
 * indent rather than an italic.
 */
function headingStyle(level: number): string {
	return `\t<w:style w:type="paragraph" w:styleId="Heading${level}">
\t\t<w:name w:val="heading ${level}"/>
\t\t<w:basedOn w:val="Normal"/>
\t\t<w:pPr><w:outlineLvl w:val="${level - 1}"/></w:pPr>
\t\t<w:rPr><w:sz w:val="${HEADING_SIZES[level - 1]}"/></w:rPr>
\t</w:style>`;
}

/** The built-in definitions, keyed by style id so a caller's can displace one. */
function builtins(monoFont: string): Map<string, string> {
	const out = new Map<string, string>([
		[
			"Normal",
			`\t<w:style w:type="paragraph" w:default="1" w:styleId="Normal">
\t\t<w:name w:val="Normal"/>
\t</w:style>`,
		],
	]);
	for (const level of [1, 2, 3, 4, 5, 6]) out.set(`Heading${level}`, headingStyle(level));
	out.set(
		"Quote",
		`\t<w:style w:type="paragraph" w:styleId="Quote">
\t\t<w:name w:val="Quote"/>
\t\t<w:basedOn w:val="Normal"/>
\t\t<w:pPr><w:ind w:left="720"/></w:pPr>
\t</w:style>`,
	);
	out.set(
		"SourceCode",
		`\t<w:style w:type="paragraph" w:styleId="SourceCode">
\t\t<w:name w:val="Source Code"/>
\t\t<w:basedOn w:val="Normal"/>
\t\t<w:pPr><w:spacing w:after="0"/></w:pPr>
\t\t<w:rPr><w:rFonts w:ascii="${escapeAttr(monoFont)}" w:hAnsi="${escapeAttr(monoFont)}"/></w:rPr>
\t</w:style>`,
	);
	out.set(
		"ListParagraph",
		`\t<w:style w:type="paragraph" w:styleId="ListParagraph">
\t\t<w:name w:val="List Paragraph"/>
\t\t<w:basedOn w:val="Normal"/>
\t</w:style>`,
	);
	out.set(
		"Hyperlink",
		`\t<w:style w:type="character" w:styleId="Hyperlink">
\t\t<w:name w:val="Hyperlink"/>
\t\t<w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr>
\t</w:style>`,
	);
	out.set(
		"FootnoteReference",
		`\t<w:style w:type="character" w:styleId="FootnoteReference">
\t\t<w:name w:val="footnote reference"/>
\t\t<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>
\t</w:style>`,
	);
	return out;
}

export interface StylesPartOptions {
	monoFont: string;
	/** Caller-defined styles, emitted alongside (or over) the built-ins. */
	styles?: DocumentStyles;
}

/**
 * `word/styles.xml`.
 *
 * Only the styles this writer actually references, plus whatever the caller
 * registered. Word is content with a sparse styles part - it falls back to its
 * own built-in definitions for anything a document names but does not define -
 * so there is nothing to gain from shipping the full latent-style table a real
 * Word export carries.
 *
 * A registered style whose id collides with a built-in **replaces** it. That is
 * the point: restyling `Quote` or `Heading1` for one novel should not require
 * forking the writer.
 */
export function stylesPart(options: StylesPartOptions | string): string {
	const opts: StylesPartOptions = typeof options === "string" ? { monoFont: options } : options;
	const defs = builtins(opts.monoFont);
	for (const [name] of opts.styles?.entries ?? []) {
		defs.set(opts.styles!.idFor(name), docxStyle(name, opts.styles!));
	}

	return `${XML_DECL}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
${[...defs.values()].join("\n")}
</w:styles>
`;
}

// ---- caller-defined styles ------------------------------------------------

const DOCX_JC: Record<string, string> = { l: "left", c: "center", r: "right", j: "both" };

const CAPS: Record<string, string | undefined> = {
	uppercase: "caps",
	lowercase: undefined,
	capitalize: undefined,
	none: undefined,
};

function on(name: string, value?: boolean): XmlElement {
	return value === false ? el(name, { "w:val": "0" }) : el(name);
}

/**
 * `<w:pPr>` for a caller-defined style.
 *
 * `<w:pPr>` is a schema *sequence*, not a bag - CT_PPrBase declares
 * `keepNext, keepLines, pageBreakBefore, widowControl, pBdr, shd, spacing, ind,
 * jc, outlineLvl` in that order, and Word rejects a document that scrambles it.
 * The order of the pushes below is therefore load-bearing, not cosmetic.
 */
function paragraphProperties(block: StyleBlock, basePt: number): XmlElement | undefined {
	const props: XmlElement[] = [];

	if (block.keepWithNext) props.push(on("w:keepNext"));
	if (block.keepTogether) props.push(on("w:keepLines"));
	if (block.breakBefore === "page") props.push(on("w:pageBreakBefore"));
	if (block.widowControl !== undefined) props.push(on("w:widowControl", block.widowControl));

	const shading = toHexColor(block.background);
	if (shading) props.push(el("w:shd", { "w:val": "clear", "w:color": "auto", "w:fill": shading }));

	const spacing: AttrMap = {};
	const before = toTwips(parseLength(block.spaceBefore), basePt);
	const after = toTwips(parseLength(block.spaceAfter), basePt);
	if (before !== undefined) spacing["w:before"] = before;
	if (after !== undefined) spacing["w:after"] = after;
	if (typeof block.lineHeight === "number") {
		// `auto` means "w:line is a multiple of single spacing", and single
		// spacing is 240 twentieths - so 1.5 line spacing is w:line="360".
		spacing["w:line"] = Math.round(240 * block.lineHeight);
		spacing["w:lineRule"] = "auto";
	} else if (block.lineHeight !== undefined) {
		const exact = toTwips(parseLength(block.lineHeight), basePt);
		if (exact !== undefined) {
			spacing["w:line"] = exact;
			spacing["w:lineRule"] = "exact";
		}
	}
	if (Object.keys(spacing).length > 0) props.push(el("w:spacing", spacing));

	const ind: AttrMap = {};
	const left = toTwips(parseLength(block.indentLeft), basePt);
	const right = toTwips(parseLength(block.indentRight), basePt);
	const first = toTwips(parseLength(block.textIndent), basePt);
	if (left !== undefined) ind["w:left"] = left;
	if (right !== undefined) ind["w:right"] = right;
	// docx has no negative first-line indent; a hanging indent is the same shape
	// spelled as its own attribute.
	if (first !== undefined && first < 0) ind["w:hanging"] = Math.abs(first);
	else if (first !== undefined) ind["w:firstLine"] = first;
	if (Object.keys(ind).length > 0) props.push(el("w:ind", ind));

	if (block.align && DOCX_JC[block.align]) {
		props.push(el("w:jc", { "w:val": DOCX_JC[block.align] }));
	}
	if (block.headingLevel !== undefined) {
		props.push(el("w:outlineLvl", { "w:val": block.headingLevel - 1 }));
	}

	return props.length === 0 ? undefined : el("w:pPr", {}, props);
}

/**
 * `<w:rPr>` for a caller-defined style. CT_RPr is a sequence too:
 * `rFonts, b, i, caps, smallCaps, strike, color, spacing, sz, szCs, u`.
 */
function styleRunProperties(block: StyleBlock, basePt: number): XmlElement | undefined {
	const props: XmlElement[] = [];

	if (block.fontFamily) {
		const family = primaryFont(block.fontFamily);
		props.push(el("w:rFonts", { "w:ascii": family, "w:hAnsi": family, "w:cs": family }));
	}
	if (block.fontWeight !== undefined) props.push(on("w:b", isBoldWeight(block.fontWeight)));
	if (block.fontStyle !== undefined) props.push(on("w:i", block.fontStyle === "italic"));
	if (block.textTransform !== undefined && CAPS[block.textTransform]) {
		props.push(on(`w:${CAPS[block.textTransform]}`));
	}
	if (block.smallCaps !== undefined) props.push(on("w:smallCaps", block.smallCaps));
	if (block.strike !== undefined) props.push(on("w:strike", block.strike));

	const color = toHexColor(block.color);
	if (color) props.push(el("w:color", { "w:val": color }));

	const tracking = toTwips(parseLength(block.letterSpacing), basePt);
	if (tracking !== undefined) props.push(el("w:spacing", { "w:val": tracking }));

	const size = toHalfPoints(parseLength(block.fontSize), basePt);
	if (size !== undefined) {
		props.push(el("w:sz", { "w:val": size }));
		props.push(el("w:szCs", { "w:val": size }));
	}
	if (block.underline !== undefined) {
		props.push(el("w:u", { "w:val": block.underline ? "single" : "none" }));
	}

	return props.length === 0 ? undefined : el("w:rPr", {}, props);
}

/**
 * The first family in a CSS font stack, unquoted.
 *
 * docx names exactly one font per script; it has no notion of a fallback list,
 * so the stack collapses to its head rather than being written out and ignored.
 */
function primaryFont(stack: string): string {
	const first = stack.split(",")[0].trim();
	return first.replace(/^["']|["']$/g, "");
}

/** One caller-defined style, as a serialized `<w:style>`. */
export function docxStyle(name: string, styles: DocumentStyles): string {
	const block = styles.resolve(name);
	const basePt = basePoints(styles);
	const family = block.family === "text" ? "character" : "paragraph";

	// `<w:name>` carries its value in `w:val`, not as text content. As element
	// text it parses fine and Word ignores it, so the style shows up in the
	// document with an empty name in the style gallery.
	const children: XmlElement[] = [
		el("w:name", { "w:val": block.displayName ?? name }),
	];
	if (block.basedOn) children.push(el("w:basedOn", { "w:val": styles.idFor(block.basedOn) }));
	if (block.nextStyle) children.push(el("w:next", { "w:val": styles.idFor(block.nextStyle) }));

	// A character style has no paragraph half at all - writing one produces a
	// document Word opens with the style silently missing.
	if (family === "paragraph") {
		const pPr = paragraphProperties(block, basePt);
		if (pPr) children.push(pPr);
	}
	const rPr = styleRunProperties(block, basePt);
	if (rPr) children.push(rPr);

	const style = el(
		"w:style",
		{ "w:type": family, "w:styleId": styles.idFor(name) },
		children,
	);
	return `\t${serializeXml(style)}`;
}

/** One list instance, as minted during the emit pass. */
export interface NumberingInstance {
	numId: string;
	kind: "ordered" | "unordered";
}

const ORDERED_FORMATS = ["decimal", "lowerLetter", "lowerRoman"];
const BULLET_CHARS = ["•", "◦", "▪"];

function levels(kind: "ordered" | "unordered"): string {
	const out: string[] = [];
	for (let level = 0; level < 9; level++) {
		const indent = 720 * (level + 1);
		out.push(
			kind === "ordered"
				? `\t\t<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="${
					ORDERED_FORMATS[level % ORDERED_FORMATS.length]
				}"/><w:lvlText w:val="%${
					level + 1
				}."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${indent}" w:hanging="360"/></w:pPr></w:lvl>`
				: `\t\t<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${
					BULLET_CHARS[level % BULLET_CHARS.length]
				}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${indent}" w:hanging="360"/></w:pPr></w:lvl>`,
		);
	}
	return out.join("\n");
}

/**
 * `word/numbering.xml`.
 *
 * Two abstract definitions - one bulleted, one numbered - and a concrete
 * `w:num` per list in the document. Sharing one `w:num` across every list
 * would make Word continue the count from the previous list instead of
 * restarting it; markdown lists always restart.
 */
export function numberingPart(instances: readonly NumberingInstance[]): string {
	const nums = instances.map((instance) =>
		`\t<w:num w:numId="${instance.numId}"><w:abstractNumId w:val="${
			instance.kind === "ordered" ? 1 : 0
		}"/></w:num>`
	).join("\n");
	return `${XML_DECL}<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
\t<w:abstractNum w:abstractNumId="0">
${levels("unordered")}
\t</w:abstractNum>
\t<w:abstractNum w:abstractNumId="1">
${levels("ordered")}
\t</w:abstractNum>
${nums}
</w:numbering>
`;
}
