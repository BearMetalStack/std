import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
	completeVariantRules,
	lookupVariantToken,
	REQUIRED_VARIANT_KEYS,
	VARIANT_TOKENS,
	VARIANT_TOKENS_BY_KEY,
} from "./tokens.ts";

Deno.test("every token key and property is unique", () => {
	assertEquals(new Set(VARIANT_TOKENS.map((t) => t.key)).size, VARIANT_TOKENS.length);
	assertEquals(new Set(VARIANT_TOKENS.map((t) => t.property)).size, VARIANT_TOKENS.length);
});

Deno.test("every derivation names a token that exists", () => {
	for (const token of VARIANT_TOKENS) {
		if (!token.from) continue;
		assert(
			VARIANT_TOKENS_BY_KEY.has(token.from),
			`${token.key} derives from ${token.from}, which is not a token`,
		);
	}
});

Deno.test("every token is reachable when a variant defines only the required keys", () => {
	const rules: Record<string, string> = {};
	for (const key of REQUIRED_VARIANT_KEYS) {
		rules[VARIANT_TOKENS_BY_KEY.get(key)!.property] = "#123456";
	}
	const complete = completeVariantRules(rules);
	for (const token of VARIANT_TOKENS) {
		assert(token.property in complete, `${token.key} (${token.property}) was not emitted`);
	}
});

Deno.test("every token is reachable even when a variant defines nothing", () => {
	const complete = completeVariantRules({});
	for (const token of VARIANT_TOKENS) {
		assert(token.property in complete, `${token.key} (${token.property}) was not emitted`);
	}
});

Deno.test("derived values reference the token they derive from", () => {
	const complete = completeVariantRules({ "--color-bg": "#101014" });
	// bgSubtle -> bg, and bgMuted -> bgSubtle, so the chain stays visible rather
	// than collapsing to the resolved colour.
	assertEquals(complete["--color-bg-subtle"], "var(--color-bg)");
	assertEquals(complete["--color-bg-muted"], "var(--color-bg-subtle)");
});

Deno.test("an explicit value always beats its derivation", () => {
	const complete = completeVariantRules({
		"--color-bg": "#101014",
		"--color-bg-subtle": "#1a1a20",
	});
	assertEquals(complete["--color-bg-subtle"], "#1a1a20");
});

Deno.test("tokens outside the manifest are passed through", () => {
	const complete = completeVariantRules({ "--card-bg": "#fff" });
	assertEquals(complete["--card-bg"], "#fff");
});

Deno.test("filled controls get an ink token, not just a fill", () => {
	for (const role of ["success", "danger", "warning", "info", "accent"]) {
		const fill = lookupVariantToken(`btn${role[0].toUpperCase()}${role.slice(1)}Bg`);
		const ink = lookupVariantToken(`btn${role[0].toUpperCase()}${role.slice(1)}Fg`);
		assert(fill, `no fill token for ${role}`);
		assert(ink, `no ink token for ${role}`);
		assertEquals(fill.property, `--btn-${role}-bg`);
		assertEquals(ink.property, `--btn-${role}-color`);
	}
});

Deno.test("a key and its custom property resolve to the same token", () => {
	// The mapping is data, not a prefix match: `toastFg` is `--toast-color`
	// while the analogous body token is `--color-text`.
	assertEquals(lookupVariantToken("toastFg"), lookupVariantToken("--toast-color"));
	assertEquals(lookupVariantToken("toastFg")?.property, "--toast-color");
	assertEquals(lookupVariantToken("text")?.property, "--color-text");
});

Deno.test("unknown names do not resolve", () => {
	assertEquals(lookupVariantToken("btnNonsenseBg"), undefined);
	assertEquals(lookupVariantToken("--btn-nonsense-bg"), undefined);
});

Deno.test("derivation cycles terminate", () => {
	// accent -> interactive -> (fallback). Nothing should hang or recurse forever.
	const complete = completeVariantRules({});
	assertStringIncludes(String(complete["--color-accent"]), "var(--color-interactive)");
});
