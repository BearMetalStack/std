import { assertEquals, assertStringIncludes } from "@std/assert";
import {
	basePoints,
	createDocumentStyles,
	isBoldWeight,
	parseLength,
	toEighthPoints,
	toHalfPoints,
	toHexColor,
	toOdfLength,
	toPoints,
	toResolvedStyle,
	toTwips,
} from "./format.ts";
import type { Node } from "./types.ts";

const at12 = 12;

// ---- lengths --------------------------------------------------------------

Deno.test("format: parses the length grammar", () => {
	assertEquals(parseLength("12pt"), { value: 12, unit: "pt" });
	assertEquals(parseLength("-1.5em"), { value: -1.5, unit: "em" });
	assertEquals(parseLength("  0.5in "), { value: 0.5, unit: "in" });
	assertEquals(parseLength("50%"), { value: 50, unit: "%" });
	// A bare number is the one guess this makes, and it guesses px.
	assertEquals(parseLength("16"), { value: 16, unit: "px" });
	assertEquals(parseLength("wide"), undefined);
	assertEquals(parseLength(undefined), undefined);
});

Deno.test("format: absolute units convert through points", () => {
	assertEquals(toPoints(parseLength("1in"), at12), 72);
	assertEquals(toPoints(parseLength("1pc"), at12), 12);
	assertEquals(toPoints(parseLength("96px"), at12), 72);
	assertEquals(Math.round(toPoints(parseLength("2.54cm"), at12)!), 72);
	assertEquals(Math.round(toPoints(parseLength("25.4mm"), at12)!), 72);
});

Deno.test("format: relative units resolve against the base font size", () => {
	assertEquals(toPoints(parseLength("1.5em"), at12), 18);
	assertEquals(toPoints(parseLength("2rem"), at12), 24);
	assertEquals(toPoints(parseLength("50%"), at12), 6);
	// A different base moves them all.
	assertEquals(toPoints(parseLength("1.5em"), 10), 15);
});

Deno.test("format: office unit conversions", () => {
	// 1pt = 20 twips, = 2 half-points, = 8 eighth-points.
	assertEquals(toTwips(parseLength("0.5in"), at12), 720);
	assertEquals(toTwips(parseLength("1.5em"), at12), 360);
	assertEquals(toHalfPoints(parseLength("12pt"), at12), 24);
	assertEquals(toHalfPoints(parseLength("24pt"), at12), 48);
	assertEquals(toEighthPoints(parseLength("1pt"), at12), 8);
	assertEquals(toTwips(parseLength("nonsense"), at12), undefined);
});

Deno.test("format: odf keeps units it understands and converts the rest", () => {
	assertEquals(toOdfLength(parseLength("1cm"), at12), "1cm");
	assertEquals(toOdfLength(parseLength("18pt"), at12), "18pt");
	// px and the relative units have no ODF spelling, so they land on points.
	assertEquals(toOdfLength(parseLength("96px"), at12), "72pt");
	assertEquals(toOdfLength(parseLength("1.5em"), at12), "18pt");
});

Deno.test("format: bold weight threshold sits at 600", () => {
	assertEquals(isBoldWeight("bold"), true);
	assertEquals(isBoldWeight("bolder"), true);
	assertEquals(isBoldWeight(600), true);
	assertEquals(isBoldWeight("700"), true);
	assertEquals(isBoldWeight("normal"), false);
	assertEquals(isBoldWeight(400), false);
	assertEquals(isBoldWeight(undefined), false);
});

Deno.test("format: colors normalize to bare six-digit hex", () => {
	assertEquals(toHexColor("#abc"), "AABBCC");
	assertEquals(toHexColor("#AABBCC"), "AABBCC");
	// An alpha channel has no docx spelling; the color survives, the alpha does not.
	assertEquals(toHexColor("#aabbcc80"), "AABBCC");
	assertEquals(toHexColor("rgb(255, 0, 128)"), "FF0080");
	assertEquals(toHexColor("rgba(0,0,0,0.5)"), "000000");
	assertEquals(toHexColor("black"), "000000");
	assertEquals(toHexColor("rebeccapurple"), undefined);
	assertEquals(toHexColor(undefined), undefined);
});

// ---- the registry ---------------------------------------------------------

function node(tag: string, data: Record<string, unknown> = {}): Node {
	return { tag: tag as Node["tag"], data, children: [] };
}

Deno.test("format: define and resolve", () => {
	const styles = createDocumentStyles()
		.define("SceneBreak", { align: "c", fontStyle: "italic" });

	assertEquals(styles.get("SceneBreak")?.align, "c");
	assertEquals(styles.resolve("SceneBreak").fontStyle, "italic");
	// The registration key becomes the display name unless one was given.
	assertEquals(styles.resolve("SceneBreak").displayName, "SceneBreak");
	// An unregistered name resolves to nothing rather than throwing.
	assertEquals(styles.resolve("Nope").align, undefined);
});

Deno.test("format: basedOn flattens root-first, most derived winning", () => {
	const styles = createDocumentStyles()
		.define("Body", { fontFamily: "Garamond", fontSize: "12pt", align: "j" })
		.define("Verse", { basedOn: "Body", align: "l", fontStyle: "italic" });

	const verse = styles.resolve("Verse");
	assertEquals(verse.fontFamily, "Garamond");
	assertEquals(verse.fontSize, "12pt");
	assertEquals(verse.align, "l");
	assertEquals(verse.fontStyle, "italic");
	// The parent link survives flattening - the writers emit it as w:basedOn.
	assertEquals(verse.basedOn, "Body");
	// ...but the parent's identity does not leak into the child.
	assertEquals(verse.displayName, "Verse");
});

Deno.test("format: a basedOn cycle terminates instead of hanging", () => {
	const styles = createDocumentStyles()
		.define("A", { basedOn: "B", align: "c" })
		.define("B", { basedOn: "A", fontStyle: "italic" });

	assertEquals(styles.resolve("A").align, "c");
	assertEquals(styles.resolve("A").fontStyle, "italic");
});

Deno.test("format: name mangling round-trips through both spellings", () => {
	const styles = createDocumentStyles().define("Scene Break", {});
	assertEquals(styles.idFor("Scene Break"), "SceneBreak");
	assertEquals(styles.classFor("Scene Break"), "scene-break");
	// Idempotent, so a name that is already an id stays put.
	assertEquals(styles.idFor("SceneBreak"), "SceneBreak");
	assertEquals(styles.classFor("scene-break"), "scene-break");
	// An explicit className wins, so an exotic class from a stylesheet survives.
	const custom = createDocumentStyles().define("Odd", { className: "oDd_One" });
	assertEquals(custom.classFor("Odd"), "oDd_One");
});

Deno.test("format: colliding ids are reported, not silently merged", () => {
	const warnings: string[] = [];
	createDocumentStyles({ onWarn: (m) => warnings.push(m) })
		.define("Scene Break", {})
		.define("scene-break", {});

	assertEquals(warnings.length, 1);
	assertStringIncludes(warnings[0], "SceneBreak");
});

Deno.test("format: nameFor prefers a node's own style over its tag binding", () => {
	const styles = createDocumentStyles()
		.define("SceneBreak", {})
		.define("Special", {})
		.bind("graver:scenebreak", "SceneBreak");

	assertEquals(styles.nameFor(node("graver:scenebreak")), "SceneBreak");
	assertEquals(styles.nameFor(node("graver:scenebreak", { style: "Special" })), "Special");
	assertEquals(styles.nameFor(node("md:heading")), undefined);
	// An empty string is not an override.
	assertEquals(styles.nameFor(node("graver:scenebreak", { style: "" })), "SceneBreak");
});

Deno.test("format: toResolvedStyle keeps only what rules can match on", () => {
	const block = {
		role: "heading" as const,
		headingLevel: 2,
		fontWeight: 700,
		fontStyle: "italic" as const,
		align: "c" as const,
		fontSize: "24pt",
	};
	const resolved = toResolvedStyle("ChapterTitle", block);

	assertEquals(resolved.named, "ChapterTitle");
	assertEquals(resolved.blockRole, "heading");
	assertEquals(resolved.headingLevel, 2);
	assertEquals(resolved.bold, true);
	assertEquals(resolved.italic, true);
	assertEquals(resolved.align, "c");
	// Typography has no ResolvedStyle slot, and deliberately so.
	assertEquals("fontSize" in resolved, false);

	// A text-family style lands on charStyle, not named.
	const inline = toResolvedStyle("Thought", { family: "text" as const });
	assertEquals(inline.charStyle, "Thought");
	assertEquals(inline.named, undefined);
});

Deno.test("format: table() exposes the registry to the read profiles", () => {
	const styles = createDocumentStyles()
		.define("Chapter Title", { role: "heading", headingLevel: 1 });
	const table = styles.table();

	// Indexed by id and by display name, same as `createStyleTable`.
	assertEquals(table.resolve("ChapterTitle").blockRole, "heading");
	assertEquals(table.resolve("Chapter Title").headingLevel, 1);
});

Deno.test("format: baseFontSize is configurable and defaults to 12pt", () => {
	assertEquals(basePoints(createDocumentStyles()), 12);
	assertEquals(basePoints(createDocumentStyles({ baseFontSize: "10pt" })), 10);
	assertEquals(basePoints(createDocumentStyles({ baseFontSize: "0.5in" })), 36);
});
