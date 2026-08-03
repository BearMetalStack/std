import type { ResolvedStyle, StyleDef, StyleResolver, StyleTable } from "../../types.ts";
import type { XmlElement } from "../../xml/types.ts";
import { createStyleTable, lookupAttr, onOff, styleFromName } from "../../style.ts";
import { XmlParser } from "../../xml/parser.ts";

export const WML_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export const DOCX_NS: Record<string, string> = { w: WML_NS, r: REL_NS };

// The name heuristics live in style.ts now (odt needs them too), but they are
// matched against the style *name* first and the id second, which is not
// pedantry: Word writes a localized `w:styleId` alongside an English `w:name`
// (`<w:style w:styleId="Uberschrift1"><w:name w:val="heading 1"/>`), so
// checking the id first would silently lose every heading in a document
// authored on a non-English installation.
export { styleFromName } from "../../style.ts";

/** Parses a part handed over as text, or passes an already-parsed one through. */
export function parseIfString(source: string | XmlElement | undefined): XmlElement | undefined {
	if (source === undefined) return undefined;
	return typeof source === "string" ? new XmlParser(source, { mode: "xml" }).parse() : source;
}

export function descendants(el: XmlElement, localName: string): XmlElement[] {
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

function firstChild(el: XmlElement | undefined, localName: string): XmlElement | undefined {
	return el?.children.find(
		(c): c is XmlElement => c.kind === "element" && c.name === localName,
	);
}

/** Reads the run properties (`<w:rPr>`) an element carries directly. */
function runProperties(rPr: XmlElement | undefined): ResolvedStyle {
	if (!rPr) return {};
	const out: ResolvedStyle = {};
	const b = firstChild(rPr, "b");
	const i = firstChild(rPr, "i");
	const strike = firstChild(rPr, "strike");
	const u = firstChild(rPr, "u");
	const highlight = firstChild(rPr, "highlight");
	const fonts = firstChild(rPr, "rFonts");

	if (b) out.bold = onOff(b);
	if (i) out.italic = onOff(i);
	if (strike) out.strike = onOff(strike);
	if (u) {
		const val = lookupAttr(u, "val");
		out.underline = val !== "none" && val !== "0";
	}
	if (highlight) {
		const val = lookupAttr(highlight, "val");
		out.highlight = val !== undefined && val !== "none";
	}
	if (fonts) {
		const ascii = lookupAttr(fonts, "ascii") ?? "";
		if (/mono|courier|consolas|menlo/i.test(ascii)) out.mono = true;
	}
	return out;
}

const ALIGN: Record<string, "l" | "c" | "r"> = {
	left: "l",
	start: "l",
	center: "c",
	centre: "c",
	right: "r",
	end: "r",
};

/** Builds a `StyleTable` from a parsed `word/styles.xml`. */
export function docxStyleTable(styles?: string | XmlElement): StyleTable {
	const root = parseIfString(styles);
	if (!root) return createStyleTable([]);

	const defs: StyleDef[] = descendants(root, "style").map((el) => {
		const id = lookupAttr(el, "styleId") ?? "";
		const name = lookupAttr(firstChild(el, "name"), "val");
		const basedOn = lookupAttr(firstChild(el, "basedOn"), "val");
		const pPr = firstChild(el, "pPr");
		const rPr = firstChild(el, "rPr");

		const style: ResolvedStyle = {
			named: name ?? id,
			...styleFromName(name ?? id),
			...runProperties(rPr),
		};
		const jc = lookupAttr(firstChild(pPr, "jc"), "val");
		if (jc && ALIGN[jc]) style.align = ALIGN[jc];
		const outline = lookupAttr(firstChild(pPr, "outlineLvl"), "val");
		if (outline !== undefined && style.headingLevel === undefined) {
			style.blockRole = "heading";
			style.headingLevel = Number(outline) + 1;
		}

		const def: StyleDef = { id, style };
		if (name) def.name = name;
		if (basedOn) def.basedOn = basedOn;
		return def;
	});

	return createStyleTable(defs);
}

/** Maps `numId` to a list kind, read from `word/numbering.xml`. */
export function docxNumbering(
	numbering?: string | XmlElement,
): Map<string, "ordered" | "unordered"> {
	const out = new Map<string, "ordered" | "unordered">();
	const root = parseIfString(numbering);
	if (!root) return out;

	const abstractKind = new Map<string, "ordered" | "unordered">();
	for (const abstract of descendants(root, "abstractNum")) {
		const id = lookupAttr(abstract, "abstractNumId");
		if (!id) continue;
		const level0 = descendants(abstract, "lvl").find((l) => lookupAttr(l, "ilvl") === "0") ??
			descendants(abstract, "lvl")[0];
		const format = lookupAttr(firstChild(level0, "numFmt"), "val");
		abstractKind.set(id, format === "bullet" ? "unordered" : "ordered");
	}

	for (const num of descendants(root, "num")) {
		const numId = lookupAttr(num, "numId");
		const abstractId = lookupAttr(firstChild(num, "abstractNumId"), "val");
		if (!numId) continue;
		// Absent or unresolvable numbering defaults to unordered: guessing
		// "bulleted" is visually harmless, guessing "numbered" invents ordinals.
		out.set(numId, (abstractId && abstractKind.get(abstractId)) || "unordered");
	}
	return out;
}

/** Maps relationship ids to their targets, read from `word/_rels/document.xml.rels`. */
export function docxRelationships(rels?: string | XmlElement): Map<string, string> {
	const out = new Map<string, string>();
	const root = parseIfString(rels);
	if (!root) return out;
	for (const rel of descendants(root, "Relationship")) {
		const id = lookupAttr(rel, "Id");
		const target = lookupAttr(rel, "Target");
		if (id && target) out.set(id, target);
	}
	return out;
}

/** Style resolver for WordprocessingML. */
export function docxStyleResolver(
	numbering: Map<string, "ordered" | "unordered"> = new Map(),
): StyleResolver {
	return {
		own(el: XmlElement, table: StyleTable): ResolvedStyle {
			if (el.name === "p") {
				const pPr = firstChild(el, "pPr");
				const named = lookupAttr(firstChild(pPr, "pStyle"), "val");
				const out: ResolvedStyle = named
					? { ...table.resolve(named), named, ...styleFromName(named) }
					: {};
				// A style table entry, when present, is more specific than the
				// name heuristic - re-apply it over the top.
				if (named && table.get(named)) Object.assign(out, table.resolve(named), { named });

				const jc = lookupAttr(firstChild(pPr, "jc"), "val");
				if (jc && ALIGN[jc]) out.align = ALIGN[jc];

				const numPr = firstChild(pPr, "numPr");
				if (numPr) {
					const numId = lookupAttr(firstChild(numPr, "numId"), "val") ?? "";
					const level = Number(lookupAttr(firstChild(numPr, "ilvl"), "val") ?? "0");
					out.blockRole = "list";
					out.list = { kind: numbering.get(numId) ?? "unordered", level, id: numId };
				}

				const outline = lookupAttr(firstChild(pPr, "outlineLvl"), "val");
				if (outline !== undefined && out.headingLevel === undefined) {
					out.blockRole = "heading";
					out.headingLevel = Number(outline) + 1;
				}
				return out;
			}

			if (el.name === "r") {
				const rPr = firstChild(el, "rPr");
				const named = lookupAttr(firstChild(rPr, "rStyle"), "val");
				return {
					...(named ? table.resolve(named) : {}),
					...runProperties(rPr),
				};
			}

			return {};
		},
	};
}
