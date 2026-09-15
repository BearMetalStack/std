import { assertEquals, assertFalse } from "@std/assert";
import type { AffixRule, AffixTable, Prefixes, Suffixes } from "./aff.ts";
import { parseDic } from "./dic.ts";

const ALWAYS = /^/; // matches unconditionally, for either anchor direction in these fixtures

function rule(overrides: Partial<AffixRule> = {}): AffixRule {
	return { strip: null, add: "", condition: ALWAYS, ...overrides };
}

function table(rules: AffixRule[], crossProduct = false): AffixTable {
	return { crossProduct, rules };
}

Deno.test("parseDic: skips the leading word-count hint line", () => {
	const dic = ["1", "cat"].join("\n");
	const lookup = parseDic(dic, { suffixes: new Map(), prefixes: new Map(), flagMode: "default" });
	assertEquals(lookup, new Set(["cat"]));
});

Deno.test("parseDic: the word-count hint is not trusted as an authoritative bound", () => {
	const dic = ["1", "cat", "dog", "bird"].join("\n");
	const lookup = parseDic(dic, { suffixes: new Map(), prefixes: new Map(), flagMode: "default" });
	assertEquals(lookup, new Set(["cat", "dog", "bird"]));
});

Deno.test("parseDic: ignores morphological data after a tab", () => {
	const dic = ["1", "run\tst:verb"].join("\n");
	const lookup = parseDic(dic, { suffixes: new Map(), prefixes: new Map(), flagMode: "default" });
	assertEquals(lookup, new Set(["run"]));
});

Deno.test("parseDic: an escaped slash in the word is not treated as a flag delimiter", () => {
	const dic = ["1", "fo\\/o"].join("\n");
	const lookup = parseDic(dic, { suffixes: new Map(), prefixes: new Map(), flagMode: "default" });
	assertEquals(lookup, new Set(["fo/o"]));
});

Deno.test("parseDic: splits word from flags at the first unescaped slash", () => {
	const dic = ["1", "fo\\/o/S"].join("\n");
	const suffixes: Suffixes = new Map([["S", table([rule({ add: "!" })])]]);
	const lookup = parseDic(dic, { suffixes, prefixes: new Map(), flagMode: "default" });
	assertEquals(lookup, new Set(["fo/o", "fo/o!"]));
});

Deno.test("parseDic: expands a suffix flag against a matching condition", () => {
	const dic = ["1", "cat/S"].join("\n");
	const suffixes: Suffixes = new Map([
		["S", table([rule({ add: "s", condition: /[^sxzy]$/ })])],
	]);
	const lookup = parseDic(dic, { suffixes, prefixes: new Map(), flagMode: "default" });
	assertEquals(lookup, new Set(["cat", "cats"]));
});

Deno.test("parseDic: a suffix rule whose condition doesn't match the stem is skipped", () => {
	const dic = ["1", "box/S"].join("\n");
	const suffixes: Suffixes = new Map([
		["S", table([rule({ add: "s", condition: /[^sxzy]$/ })])],
	]);
	const lookup = parseDic(dic, { suffixes, prefixes: new Map(), flagMode: "default" });
	assertEquals(lookup, new Set(["box"]));
});

Deno.test("parseDic: expands a prefix flag, stripping and prepending as directed", () => {
	const dic = ["1", "happy/U"].join("\n");
	const prefixes: Prefixes = new Map([["U", table([rule({ add: "un" })])]]);
	const lookup = parseDic(dic, { suffixes: new Map(), prefixes, flagMode: "default" });
	assertEquals(lookup, new Set(["happy", "unhappy"]));
});

Deno.test("parseDic: strip removes the given substring before adding", () => {
	const dic = ["1", "happy/S"].join("\n");
	const suffixes: Suffixes = new Map([
		["S", table([rule({ strip: "y", add: "iness" })])],
	]);
	const lookup = parseDic(dic, { suffixes, prefixes: new Map(), flagMode: "default" });
	assertEquals(lookup, new Set(["happy", "happiness"]));
});

Deno.test("parseDic: cross-product expansion combines prefix and suffix when both allow it", () => {
	const dic = ["1", "do/US"].join("\n");
	const prefixes: Prefixes = new Map([["U", table([rule({ add: "un" })], true)]]);
	const suffixes: Suffixes = new Map([["S", table([rule({ add: "s" })], true)]]);
	const lookup = parseDic(dic, { suffixes, prefixes, flagMode: "default" });
	assertEquals(lookup, new Set(["do", "undo", "dos", "undos"]));
});

Deno.test("parseDic: no cross-product form when one side disallows it", () => {
	const dic = ["1", "do/US"].join("\n");
	const prefixes: Prefixes = new Map([["U", table([rule({ add: "un" })], true)]]);
	const suffixes: Suffixes = new Map([["S", table([rule({ add: "s" })], false)]]);
	const lookup = parseDic(dic, { suffixes, prefixes, flagMode: "default" });
	assertEquals(lookup, new Set(["do", "undo", "dos"]));
	assertFalse(lookup.has("undos"));
});

Deno.test("parseDic: honors long FLAG mode when splitting a word's flags", () => {
	const dic = ["1", "do/AABB"].join("\n");
	const suffixes: Suffixes = new Map([["BB", table([rule({ add: "s" })])]]);
	const lookup = parseDic(dic, { suffixes, prefixes: new Map(), flagMode: "long" });
	assertEquals(lookup, new Set(["do", "dos"]));
});

Deno.test("parseDic: honors num FLAG mode when splitting a word's flags", () => {
	const dic = ["1", "do/1,2"].join("\n");
	const suffixes: Suffixes = new Map([["2", table([rule({ add: "s" })])]]);
	const lookup = parseDic(dic, { suffixes, prefixes: new Map(), flagMode: "num" });
	assertEquals(lookup, new Set(["do", "dos"]));
});
