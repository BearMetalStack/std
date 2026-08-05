/**
 * @module
 * The parts of a `.docx` that are boilerplate rather than content.
 *
 * These are template strings rather than `el()` trees on purpose: nothing in
 * them varies with the document except the two loops at the bottom, and a
 * literal is both shorter and far easier to check against the spec than the
 * builder calls that would produce it.
 *
 * The style ids here are the ones `styleFromName()` in style.ts already
 * recognizes, so a document written by this profile reads back correctly even
 * when the caller never hands `styles.xml` to `docxProfile()`. Changing an id
 * or a `w:name` without changing that function breaks the round trip silently.
 */

import type { ResourceEntry } from "../../types.ts";
import { XML_DECL } from "../../xml/build.ts";

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

/**
 * `word/styles.xml`.
 *
 * Only the styles this writer actually references. Word is content with a
 * sparse styles part - it falls back to its own built-in definitions for
 * anything a document names but does not define - so there is nothing to gain
 * from shipping the full latent-style table a real Word export carries.
 */
export function stylesPart(monoFont: string): string {
	const headings = [1, 2, 3, 4, 5, 6].map(headingStyle).join("\n");
	return `${XML_DECL}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
\t<w:style w:type="paragraph" w:default="1" w:styleId="Normal">
\t\t<w:name w:val="Normal"/>
\t</w:style>
${headings}
\t<w:style w:type="paragraph" w:styleId="Quote">
\t\t<w:name w:val="Quote"/>
\t\t<w:basedOn w:val="Normal"/>
\t\t<w:pPr><w:ind w:left="720"/></w:pPr>
\t</w:style>
\t<w:style w:type="paragraph" w:styleId="SourceCode">
\t\t<w:name w:val="Source Code"/>
\t\t<w:basedOn w:val="Normal"/>
\t\t<w:pPr><w:spacing w:after="0"/></w:pPr>
\t\t<w:rPr><w:rFonts w:ascii="${escapeAttr(monoFont)}" w:hAnsi="${escapeAttr(monoFont)}"/></w:rPr>
\t</w:style>
\t<w:style w:type="paragraph" w:styleId="ListParagraph">
\t\t<w:name w:val="List Paragraph"/>
\t\t<w:basedOn w:val="Normal"/>
\t</w:style>
\t<w:style w:type="character" w:styleId="Hyperlink">
\t\t<w:name w:val="Hyperlink"/>
\t\t<w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr>
\t</w:style>
\t<w:style w:type="character" w:styleId="FootnoteReference">
\t\t<w:name w:val="footnote reference"/>
\t\t<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>
\t</w:style>
</w:styles>
`;
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
