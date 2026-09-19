import { assertEquals, assertRejects, assertStrictEquals, assertThrows } from "@std/assert";
import { checkAgainstLookup, SpellChecker } from "./checker.ts";
import {
	DictionaryNotFoundError,
	LanguageLoadFailedError,
	LanguagePendingError,
	UnknownLanguageError,
} from "./errors.ts";
import type { DictionaryPaths } from "./types.ts";

const AFF = ["SET UTF-8", "SFX S Y 1", "SFX S 0 s [^sxzy]"].join("\n");
const DIC = ["3", "well", "known", "cat/S"].join("\n");

const ICONV_AFF = [AFF, "ICONV 1", "ICONV ’ '"].join("\n");
const ICONV_DIC = ["1", "hadn't"].join("\n");

/** A temp dir with a valid `.aff`/`.dic` pair, plus its cleanup. */
async function tempDictionary(
	affText = AFF,
	dicText = DIC,
): Promise<[DictionaryPaths, () => Promise<void>]> {
	const dir = await Deno.makeTempDir({ prefix: "flux-test-" });
	const aff = `${dir}/test.aff`;
	const dic = `${dir}/test.dic`;
	await Deno.writeTextFile(aff, affText);
	await Deno.writeTextFile(dic, dicText);
	return [{ aff, dic }, () => Deno.remove(dir, { recursive: true })];
}

Deno.test("check: throws UnknownLanguageError when loadLanguage was never called", () => {
	const checker = new SpellChecker();
	assertThrows(() => checker.check("en", "cat"), UnknownLanguageError);
});

Deno.test("langReady: throws synchronously when loadLanguage was never called", () => {
	const checker = new SpellChecker();
	assertThrows(() => checker.langReady("en"), UnknownLanguageError);
});

Deno.test("check: throws LanguagePendingError before the load settles", async () => {
	const [paths, cleanup] = await tempDictionary();
	try {
		const checker = new SpellChecker();
		const promise = checker.loadLanguage("en", paths);
		assertThrows(() => checker.check("en", "cat"), LanguagePendingError);
		await promise;
	} finally {
		await cleanup();
	}
});

Deno.test("check: answers correctly once the load settles", async () => {
	const [paths, cleanup] = await tempDictionary();
	try {
		const checker = new SpellChecker();
		await checker.loadLanguage("en", paths);
		assertEquals(checker.check("en", "well"), true);
		assertEquals(checker.check("en", "known"), true);
		assertEquals(checker.check("en", "cat"), true);
		assertEquals(checker.check("en", "cats"), true);
		assertEquals(checker.check("en", "dog"), false);
	} finally {
		await cleanup();
	}
});

Deno.test("check: a lowercase-only dictionary word still passes capitalized", async () => {
	const [paths, cleanup] = await tempDictionary();
	try {
		const checker = new SpellChecker();
		await checker.loadLanguage("en", paths);
		// Sentence-initial and headline capitalization of a word the dictionary only stores
		// lowercase — this is the fallback Hunspell does and a flat exact-match lookup doesn't.
		assertEquals(checker.check("en", "Well"), true);
		assertEquals(checker.check("en", "WELL"), true);
		// A capitalization the dictionary genuinely doesn't cover still fails.
		assertEquals(checker.check("en", "Dog"), false);
	} finally {
		await cleanup();
	}
});

Deno.test("check: a word typed with a typographic apostrophe matches an ICONV-mapped dictionary entry", async () => {
	const [paths, cleanup] = await tempDictionary(ICONV_AFF, ICONV_DIC);
	try {
		const checker = new SpellChecker();
		await checker.loadLanguage("en", paths);
		// The dictionary only has the straight-apostrophe form; ICONV is what makes the
		// typographic variant a user (or an editor's smart-quote autocorrect) actually typed match.
		assertEquals(checker.check("en", "hadn’t"), true);
		assertEquals(checker.check("en", "hadn't"), true);
	} finally {
		await cleanup();
	}
});

Deno.test("check: hyphenated words pass only if every segment does", async () => {
	const [paths, cleanup] = await tempDictionary();
	try {
		const checker = new SpellChecker();
		await checker.loadLanguage("en", paths);
		assertEquals(checker.check("en", "well-known"), true);
		assertEquals(checker.check("en", "well-dog"), false);
	} finally {
		await cleanup();
	}
});

Deno.test("check: a leading, trailing, or doubled hyphen doesn't fail the word on its own", async () => {
	const [paths, cleanup] = await tempDictionary();
	try {
		const checker = new SpellChecker();
		await checker.loadLanguage("en", paths);
		// The empty segments these produce are skipped, not treated as failures — flagging them
		// would be a false positive on ordinary hyphenation noise, not a real misspelling.
		assertEquals(checker.check("en", "-well"), true);
		assertEquals(checker.check("en", "well-"), true);
		assertEquals(checker.check("en", "well--known"), true);
	} finally {
		await cleanup();
	}
});

// ─── checkAgainstLookup: SpellCheckResult aggregation and position reporting ───

const LOOKUP = new Set(["well", "known"]);

Deno.test("checkAgainstLookup: a correct non-hyphenated word reports no positions", () => {
	assertEquals(checkAgainstLookup("well", LOOKUP), { correct: true });
});

Deno.test("checkAgainstLookup: a wrong non-hyphenated word points at the whole word", () => {
	assertEquals(checkAgainstLookup("wall", LOOKUP), { correct: false, at: [[0, 4]] });
});

Deno.test("checkAgainstLookup: an offset shifts a whole-word failure's reported range", () => {
	assertEquals(checkAgainstLookup("wall", LOOKUP, 5), { correct: false, at: [[5, 9]] });
});

Deno.test("checkAgainstLookup: a bad segment in a hyphenated word is pinpointed", () => {
	// "well-dog": "dog" starts right after "well-" (5 chars in).
	assertEquals(checkAgainstLookup("well-dog", LOOKUP), { correct: false, at: [[5, 8]] });
});

Deno.test("checkAgainstLookup: multiple bad segments all get reported", () => {
	assertEquals(checkAgainstLookup("foo-well-bar", LOOKUP), {
		correct: false,
		at: [[0, 3], [9, 12]],
	});
});

Deno.test("checkAgainstLookup: empty segments from stray hyphens are skipped, not reported", () => {
	assertEquals(checkAgainstLookup("-well", LOOKUP), { correct: true });
	assertEquals(checkAgainstLookup("well-", LOOKUP), { correct: true });
	assertEquals(checkAgainstLookup("well--known", LOOKUP), { correct: true });
});

Deno.test("checkAgainstLookup: a word that's only hyphens has nothing to report", () => {
	assertEquals(checkAgainstLookup("--", LOOKUP), { correct: true });
});

Deno.test("checkAgainstLookup: an initial-cap word falls back to the lowercase form", () => {
	assertEquals(checkAgainstLookup("Well", LOOKUP), { correct: true });
});

Deno.test("checkAgainstLookup: an all-caps word falls back to the lowercase form", () => {
	assertEquals(checkAgainstLookup("WELL", LOOKUP), { correct: true });
});

Deno.test("checkAgainstLookup: mixed internal capitalization gets no fallback", () => {
	// "wELL" isn't a form Hunspell's own capitalization heuristics recognize either — only exact,
	// initial-cap, and all-caps get a retry.
	assertEquals(checkAgainstLookup("wELL", LOOKUP), { correct: false, at: [[0, 4]] });
});

Deno.test("checkAgainstLookup: an all-lowercase miss never fires the capitalization fallback", () => {
	assertEquals(checkAgainstLookup("wall", LOOKUP), { correct: false, at: [[0, 4]] });
});

Deno.test("forLanguage: sugar delegates to check() for the bound language", async () => {
	const [paths, cleanup] = await tempDictionary();
	try {
		const checker = new SpellChecker();
		await checker.loadLanguage("en", paths);
		const en = checker.forLanguage("en");
		assertEquals(en.check("cat"), true);
		assertEquals(en.check("dog"), false);
	} finally {
		await cleanup();
	}
});

Deno.test("loadLanguage: rejects with the raw underlying cause, not a wrapper", async () => {
	const checker = new SpellChecker();
	const missing = { aff: "/nonexistent/x.aff", dic: "/nonexistent/x.dic" };
	await assertRejects(() => checker.loadLanguage("en", missing), DictionaryNotFoundError);
});

Deno.test("loadLanguage and langReady share the exact same promise instance", () => {
	const checker = new SpellChecker();
	const loadPromise = checker.loadLanguage("en", {
		aff: "/nonexistent/x.aff",
		dic: "/nonexistent/x.dic",
	});
	const readyPromise = checker.langReady("en");
	assertStrictEquals(loadPromise, readyPromise);
	// Prevent this deliberate failure from surfacing as an unhandled rejection.
	loadPromise.catch(() => {});
});

Deno.test("check: throws LanguageLoadFailedError wrapping the cause once a load fails", async () => {
	const checker = new SpellChecker();
	const missing = { aff: "/nonexistent/x.aff", dic: "/nonexistent/x.dic" };
	const promise = checker.loadLanguage("en", missing);
	await checker.ready;
	const err = assertThrows(() => checker.check("en", "cat"), LanguageLoadFailedError);
	assertEquals(err.cause instanceof DictionaryNotFoundError, true);
	await promise.catch(() => {});
});

Deno.test("ready: resolves even when some in-flight loads fail, and never rejects", async () => {
	const [paths, cleanup] = await tempDictionary();
	try {
		const checker = new SpellChecker();
		const okPromise = checker.loadLanguage("en", paths);
		const badPromise = checker.loadLanguage(
			"bad",
			{ aff: "/nonexistent/x.aff", dic: "/nonexistent/x.dic" },
		);
		await checker.ready;
		assertEquals(checker.check("en", "cat"), true);
		assertThrows(() => checker.check("bad", "cat"), LanguageLoadFailedError);
		await okPromise;
		await badPromise.catch(() => {});
	} finally {
		await cleanup();
	}
});

Deno.test("ready: re-arms to track a language loaded after a prior ready resolved", async () => {
	const [pathsA, cleanupA] = await tempDictionary();
	const [pathsB, cleanupB] = await tempDictionary();
	try {
		const checker = new SpellChecker();
		await checker.loadLanguage("a", pathsA);
		await checker.ready;

		checker.loadLanguage("b", pathsB);
		assertThrows(() => checker.check("b", "cat"), LanguagePendingError);

		await checker.ready;
		assertEquals(checker.check("b", "cat"), true);
	} finally {
		await cleanupA();
		await cleanupB();
	}
});
