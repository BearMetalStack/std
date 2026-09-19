import { assertEquals, assertFalse } from "@std/assert";
import { applyIconv, compileCondition, parseAff } from "./aff.ts";

// ─── compileCondition ───────────────────────────────────────────────────────

Deno.test("compileCondition: '.' matches any non-empty stem", () => {
	const suffixCond = compileCondition(".", "suffix");
	assertEquals(suffixCond.test("cat"), true);
	assertEquals(suffixCond.test(""), false);
});

Deno.test("compileCondition: empty condition matches unconditionally, including empty stems", () => {
	assertEquals(compileCondition("", "suffix").test(""), true);
	assertEquals(compileCondition("", "prefix").test(""), true);
});

Deno.test("compileCondition: character class anchors at the end for suffixes", () => {
	const cond = compileCondition("[^aeiou]y", "suffix");
	assertEquals(cond.test("happy"), true);
	assertEquals(cond.test("day"), false);
	assertEquals(cond.test("y"), false);
});

Deno.test("compileCondition: negated character class works", () => {
	const cond = compileCondition("[^sxzy]", "suffix");
	assertEquals(cond.test("cat"), true);
	assertEquals(cond.test("box"), false);
});

Deno.test("compileCondition: anchors at the start for prefixes", () => {
	const cond = compileCondition("b", "prefix");
	assertEquals(cond.test("bake"), true);
	assertEquals(cond.test("cake"), false);
});

// ─── parseAff: simple directives ────────────────────────────────────────────

Deno.test("parseAff: FLAG directive sets flagMode", () => {
	assertEquals(parseAff("FLAG long").flagMode, "long");
	assertEquals(parseAff("FLAG num").flagMode, "num");
	assertEquals(parseAff("").flagMode, "default");
});

Deno.test("parseAff: stores simple key-value directives verbatim", () => {
	const { directives } = parseAff(
		[
			"SET UTF-8",
			"TRY esianrtolcdugmphbyfvkwjxqz",
			"WORDCHARS 0123456789",
			"LANG en_US",
			"IGNORE -",
		].join("\n"),
	);
	assertEquals(directives.get("SET"), "UTF-8");
	assertEquals(directives.get("TRY"), "esianrtolcdugmphbyfvkwjxqz");
	assertEquals(directives.get("WORDCHARS"), "0123456789");
	assertEquals(directives.get("LANG"), "en_US");
	assertEquals(directives.get("IGNORE"), "-");
});

Deno.test("parseAff: ignores comment and blank lines", () => {
	const { directives } = parseAff(["# a comment", "", "SET UTF-8", "  "].join("\n"));
	assertEquals(directives.get("SET"), "UTF-8");
});

// ─── parseAff: SFX/PFX blocks ───────────────────────────────────────────────

Deno.test("parseAff: parses an SFX block into the suffixes table", () => {
	const aff = [
		"SFX S Y 2",
		"SFX S 0 s [^sxzy]",
		"SFX S y ies y",
	].join("\n");
	const { suffixes } = parseAff(aff);
	const table = suffixes.get("S")!;
	assertEquals(table.crossProduct, true);
	assertEquals(table.rules.length, 2);
	assertEquals(table.rules[0].strip, null);
	assertEquals(table.rules[0].add, "s");
	assertEquals(table.rules[0].condition.test("cat"), true);
	assertEquals(table.rules[1].strip, "y");
	assertEquals(table.rules[1].add, "ies");
	assertEquals(table.rules[1].condition.test("happy"), true);
});

Deno.test("parseAff: parses a PFX block into the prefixes table", () => {
	const aff = [
		"PFX U N 1",
		"PFX U 0 un .",
	].join("\n");
	const { prefixes } = parseAff(aff);
	const table = prefixes.get("U")!;
	assertEquals(table.crossProduct, false);
	assertEquals(table.rules.length, 1);
	assertEquals(table.rules[0].strip, null);
	assertEquals(table.rules[0].add, "un");
});

Deno.test("parseAff: strips continuation flags off the 'add' field without acting on them", () => {
	const aff = ["SFX G Y 1", "SFX G 0 ing/S ."].join("\n");
	const { suffixes } = parseAff(aff);
	assertEquals(suffixes.get("G")!.rules[0].add, "ing");
});

Deno.test("parseAff: a rule line after a block is not swallowed into the block", () => {
	const aff = [
		"SFX S Y 1",
		"SFX S 0 s .",
		"SET UTF-8",
	].join("\n");
	const { directives } = parseAff(aff);
	assertEquals(directives.get("SET"), "UTF-8");
});

// ─── parseAff: ICONV ────────────────────────────────────────────────────────

Deno.test("parseAff: ICONV parses its rule lines into the iconv table", () => {
	const aff = ["ICONV 1", "ICONV ’ '"].join("\n");
	const { iconv } = parseAff(aff);
	assertEquals(iconv, [{ from: "’", to: "'" }]);
});

Deno.test("parseAff: ICONV rules sort longest-from-first for greedy matching", () => {
	const aff = ["ICONV 2", "ICONV a x", "ICONV ab y"].join("\n");
	const { iconv } = parseAff(aff);
	assertEquals(iconv, [{ from: "ab", to: "y" }, { from: "a", to: "x" }]);
});

Deno.test("parseAff: an SFX block after ICONV parses correctly", () => {
	const aff = ["ICONV 1", "ICONV ’ '", "SFX S Y 1", "SFX S 0 s ."].join("\n");
	const { suffixes } = parseAff(aff);
	assertEquals(suffixes.get("S")!.rules.length, 1);
});

// ─── applyIconv ─────────────────────────────────────────────────────────────

Deno.test("applyIconv: replaces every occurrence of a rule's pattern", () => {
	assertEquals(applyIconv("hadn’t", [{ from: "’", to: "'" }]), "hadn't");
});

Deno.test("applyIconv: matches the longest pattern available at each position", () => {
	assertEquals(applyIconv("ab", [{ from: "ab", to: "y" }, { from: "a", to: "x" }]), "y");
});

Deno.test("applyIconv: a word with no matching pattern is returned unchanged", () => {
	assertEquals(applyIconv("well", [{ from: "’", to: "'" }]), "well");
});

Deno.test("applyIconv: an empty rule list is a no-op", () => {
	assertEquals(applyIconv("well", []), "well");
});

// ─── parseAff: unimplemented table directives don't misalign parsing ───────

Deno.test("parseAff: skips a table directive's N lines and resumes correctly after", () => {
	const aff = [
		"REP 2",
		"REP a b",
		"REP c d",
		"SET UTF-8",
	].join("\n");
	const { directives } = parseAff(aff);
	assertEquals(directives.get("SET"), "UTF-8");
	assertFalse(directives.has("REP"));
});

Deno.test("parseAff: an SFX block after a skipped table directive parses correctly", () => {
	const aff = [
		"COMPOUNDRULE 1",
		"COMPOUNDRULE (a)(b)*",
		"SFX S Y 1",
		"SFX S 0 s .",
	].join("\n");
	const { suffixes } = parseAff(aff);
	assertEquals(suffixes.get("S")!.rules.length, 1);
});

// ─── parseAff: debug warnings for unhandled directives ─────────────────────

Deno.test("parseAff: does not warn on unhandled directives by default", () => {
	const warnings: unknown[][] = [];
	const original = console.warn;
	console.warn = (...args: unknown[]) => warnings.push(args);
	try {
		parseAff("COMPOUNDFLAG X");
	} finally {
		console.warn = original;
	}
	assertEquals(warnings.length, 0);
});

Deno.test("parseAff: warns on unhandled directives when debug is enabled", () => {
	const warnings: unknown[][] = [];
	const original = console.warn;
	console.warn = (...args: unknown[]) => warnings.push(args);
	try {
		parseAff("COMPOUNDFLAG X", { debug: true });
	} finally {
		console.warn = original;
	}
	assertEquals(warnings.length, 1);
	assertEquals(String(warnings[0][0]).includes("COMPOUNDFLAG"), true);
});
