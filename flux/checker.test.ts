import {
	assertEquals,
	assertRejects,
	assertStrictEquals,
	assertThrows,
} from "@std/assert";
import { SpellChecker } from "./checker.ts";
import {
	DictionaryNotFoundError,
	LanguageLoadFailedError,
	LanguagePendingError,
	UnknownLanguageError,
} from "./errors.ts";
import type { DictionaryPaths } from "./types.ts";

const AFF = ["SET UTF-8", "SFX S Y 1", "SFX S 0 s [^sxzy]"].join("\n");
const DIC = ["3", "well", "known", "cat/S"].join("\n");

/** A temp dir with a valid `.aff`/`.dic` pair, plus its cleanup. */
async function tempDictionary(): Promise<[DictionaryPaths, () => Promise<void>]> {
	const dir = await Deno.makeTempDir({ prefix: "flux-test-" });
	const aff = `${dir}/test.aff`;
	const dic = `${dir}/test.dic`;
	await Deno.writeTextFile(aff, AFF);
	await Deno.writeTextFile(dic, DIC);
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

Deno.test("check: a leading, trailing, or doubled hyphen fails the whole word", async () => {
	const [paths, cleanup] = await tempDictionary();
	try {
		const checker = new SpellChecker();
		await checker.loadLanguage("en", paths);
		assertEquals(checker.check("en", "-well"), false);
		assertEquals(checker.check("en", "well-"), false);
		assertEquals(checker.check("en", "well--known"), false);
	} finally {
		await cleanup();
	}
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
	const loadPromise = checker.loadLanguage("en", { aff: "/nonexistent/x.aff", dic: "/nonexistent/x.dic" });
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
