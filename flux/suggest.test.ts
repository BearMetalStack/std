import { assert, assertEquals } from "@std/assert";
import { checkAgainstLookup } from "./checker.ts";
import { suggestFromLookup, suggestionAlphabet, type SuggestionSource } from "./suggest.ts";
import type { RepRule } from "./aff.ts";

function source(words: string[], rep: RepRule[] = [], tryChars?: string): SuggestionSource {
	const lookup = new Set(words);
	return {
		lookup,
		alphabet: suggestionAlphabet(tryChars, lookup),
		rep,
		isCorrect: (word) => checkAgainstLookup(word, lookup).correct,
	};
}

const WORDS = [
	"the",
	"tea",
	"ten",
	"their",
	"thief",
	"name",
	"known",
	"well",
	"happen",
	"haven",
	"surprise",
	"sunrise",
	"a",
	"lot",
	"in",
	"phone",
	"Paris",
	"NASA",
	"definitely",
	"cafe",
	"café",
];

Deno.test("suggest: a transposed pair outranks every other single edit", () => {
	const src = source(WORDS);
	assertEquals(suggestFromLookup("teh", src)[0], "the");
	assertEquals(suggestFromLookup("thier", src)[0], "their");
	assertEquals(suggestFromLookup("nmae", src)[0], "name");
});

Deno.test("suggest: a missing letter outranks a wrong one", () => {
	const src = source(WORDS);
	assertEquals(suggestFromLookup("hapen", src)[0], "happen");
	assertEquals(suggestFromLookup("suprise", src)[0], "surprise");
});

Deno.test("suggest: never includes the word itself, even when it's correct", () => {
	const src = source(WORDS);
	const suggestions = suggestFromLookup("ten", src);
	assert(!suggestions.includes("ten"));
	assert(suggestions.includes("tea"));
});

Deno.test("suggest: carries the input's capitalization over", () => {
	const src = source(WORDS);
	assertEquals(suggestFromLookup("Teh", src)[0], "The");
	assertEquals(suggestFromLookup("TEH", src)[0], "THE");
});

Deno.test("suggest: a capitalization-only fix ranks first", () => {
	const src = source(WORDS);
	assertEquals(suggestFromLookup("paris", src)[0], "Paris");
	assertEquals(suggestFromLookup("nasa", src)[0], "NASA");
	assertEquals(suggestFromLookup("Nasa", src)[0], "NASA");
});

Deno.test("suggest: a lowercase typo of a proper noun finds it", () => {
	assertEquals(suggestFromLookup("pariss", source(WORDS))[0], "Paris");
});

Deno.test("suggest: REP rules rank ahead of plain edits, and _ splits into two words", () => {
	const rep: RepRule[] = [
		{ from: "f", to: "ph", anchorStart: false, anchorEnd: false },
		{ from: "alot", to: "a lot", anchorStart: true, anchorEnd: true },
	];
	const src = source([...WORDS, "fine", "fore"], rep);
	assertEquals(suggestFromLookup("fone", src)[0], "phone");
	assertEquals(suggestFromLookup("alot", src)[0], "a lot");
});

Deno.test("suggest: REP anchors are respected", () => {
	const rep: RepRule[] = [{ from: "x", to: "the", anchorStart: false, anchorEnd: true }];
	const src = source(["the", "then"], rep);
	assertEquals(suggestFromLookup("x", src, { maxDistance: 0 }), ["the"]);
	assertEquals(suggestFromLookup("xn", src, { maxDistance: 0 }), []);
});

Deno.test("suggest: splits a run-together pair, but not into single letters", () => {
	const src = source(WORDS);
	assert(suggestFromLookup("inthe", src).includes("in the"));
	const split = suggestFromLookup("inthe", source(["in", "int", "he", "the"]));
	assertEquals(split.slice(0, 2), ["in the", "int he"]);
	assert(!suggestFromLookup("alot", src).includes("a lot"));
});

Deno.test("suggest: fixes the failing segment of a hyphenated word", () => {
	assertEquals(suggestFromLookup("well-knwon", source(WORDS))[0], "well-known");
});

Deno.test("suggest: falls back to scanning for words two edits away", () => {
	assert(suggestFromLookup("defanitly", source(WORDS)).includes("definitely"));
});

Deno.test("suggest: maxDistance bounds the scan", () => {
	assertEquals(suggestFromLookup("defanitly", source(WORDS), { maxDistance: 1 }), []);
});

Deno.test("suggest: short words default to a distance of one", () => {
	assert(!suggestFromLookup("tx", source(WORDS)).includes("the"));
	assert(suggestFromLookup("tx", source(WORDS), { maxDistance: 2 }).includes("the"));
});

Deno.test("suggest: limit caps the result", () => {
	assertEquals(suggestFromLookup("teh", source(WORDS), { limit: 2 }).length, 2);
	assertEquals(suggestFromLookup("teh", source(WORDS), { limit: 0 }), []);
});

Deno.test("suggest: compares astral and accented characters as one character each", () => {
	assertEquals(suggestFromLookup("ca😀", source(["caf"]), { maxDistance: 1 }), ["caf"]);
	assertEquals(suggestFromLookup("cafe", source(["caf😀"]), { maxDistance: 1 }), ["caf😀"]);
	assertEquals(suggestFromLookup("cafè", source(["café"]), { maxDistance: 1 }), ["café"]);
});

Deno.test("suggest: nothing close enough yields nothing", () => {
	assertEquals(suggestFromLookup("xyzzyq", source(WORDS)), []);
});

Deno.test("suggestionAlphabet: uses TRY when present, else dictionary characters by frequency", () => {
	assertEquals(suggestionAlphabet("esiaes", new Set()), ["e", "s", "i", "a"]);
	assertEquals(suggestionAlphabet(undefined, new Set(["aab", "Ab"])), ["a", "b"]);
});
