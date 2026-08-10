/**
 * Generate-time validation for Drip themes.
 *
 * Drip's failure mode is silence: an unparseable media query makes a browser
 * discard a whole variant block, and a `var()` naming a property nothing
 * defines makes the declaration invalid at computed-value time, so the token
 * inherits instead of taking a colour. Neither shows up as an error anywhere.
 * These checks turn both into something an author can read.
 *
 * @module
 */

import type { Variant } from "../types.ts";
import { VARIANT_TOKENS } from "./tokens.ts";

/** Severity of a generate-time finding. */
export type DiagnosticLevel = "error" | "warning";

/** Something wrong (or suspicious) about a theme, found while generating CSS. */
export interface DripDiagnostic {
	level: DiagnosticLevel;
	/** Where in the theme the problem is, e.g. `variant "dark" → --color-bg`. */
	where: string;
	message: string;
}

/**
 * Set by `BEARMETAL_DRIP_STRICT`. When on, warnings are promoted to errors and
 * generation fails rather than emitting a stylesheet with dangling references.
 */
export function isStrict(): boolean {
	try {
		const flag = Deno.env.get("BEARMETAL_DRIP_STRICT");
		return flag === "1" || flag === "true";
	} catch {
		// No env permission — stay lenient rather than blowing up generation.
		return false;
	}
}

/**
 * Normalises a variant's media query into something a browser will actually
 * parse. Drip interpolates the value straight into `@media <value> {`, so a
 * bare `prefers-color-scheme: dark` produces invalid CSS and the entire variant
 * is dropped.
 *
 * Accepts a leading `@media`, wraps a bare `feature: value` in parentheses, and
 * rejects unbalanced parentheses.
 *
 * @throws if the query is empty or has unbalanced parentheses.
 */
export function normalizeMediaQuery(media: string): string {
	let query = media.trim().replace(/^@media\s+/i, "").trim();
	if (!query) throw new Error("Media query is empty");

	let depth = 0;
	for (const char of query) {
		if (char === "(") depth++;
		else if (char === ")" && --depth < 0) break;
	}
	if (depth !== 0) throw new Error(`Unbalanced parentheses in media query: ${media}`);

	// `prefers-color-scheme: dark` is a feature test, not a media query; only
	// `(prefers-color-scheme: dark)` is.
	if (!query.includes("(") && query.includes(":")) query = `(${query})`;
	return query;
}

const VAR_REFERENCE = /var\(\s*(--[\w-]+)/g;

/** Every custom property named by a `var()` in a CSS value. */
export function findVarReferences(value: string): string[] {
	return [...value.matchAll(VAR_REFERENCE)].map((m) => m[1]);
}

/**
 * Checks that every `var()` in every variant rule names a property the
 * stylesheet actually defines, and that every media query parses.
 *
 * Dangling references are warnings rather than errors by default: a theme may
 * legitimately reach for a property defined by a stylesheet loaded alongside it.
 * `BEARMETAL_DRIP_STRICT` promotes them.
 *
 * @param variants The theme's variants, already unwrapped from the theme file.
 * @param defined Custom properties the generated stylesheet defines, including
 *   the ones the variants themselves introduce.
 */
export function validateVariants(
	variants: readonly Variant[],
	defined: ReadonlySet<string>,
): DripDiagnostic[] {
	const diagnostics: DripDiagnostic[] = [];

	if (!variants.length) {
		diagnostics.push({
			level: "warning",
			where: "variants",
			message:
				"the theme defines no variants, so none of the semantic colour tokens are set and anything built on them falls back to its initial value",
		});
	}

	const defaults = variants.filter((v) => v.default);
	if (variants.length && !defaults.length) {
		diagnostics.push({
			level: "warning",
			where: "variants",
			message:
				`no variant is marked default, so a visitor gets colours only when a media query matches or \`data-theme\` is set explicitly (variants: ${
					variants.map((v) => `"${v.name}"`).join(", ")
				})`,
		});
	}
	if (defaults.length > 1) {
		diagnostics.push({
			level: "error",
			where: "variants",
			message: `${defaults.length} variants are marked default (${
				defaults.map((v) => `"${v.name}"`).join(", ")
			}); only one may be`,
		});
	}

	const seen = new Set<string>();
	for (const variant of variants) {
		if (seen.has(variant.name)) {
			diagnostics.push({
				level: "error",
				where: `variant "${variant.name}"`,
				message: "duplicate variant name — the later one wins and the earlier is dead weight",
			});
		}
		seen.add(variant.name);
		diagnostics.push(...validateVariant(variant, defined));
	}

	return diagnostics;
}

function validateVariant(variant: Variant, defined: ReadonlySet<string>): DripDiagnostic[] {
	const diagnostics: DripDiagnostic[] = [];

	if (variant.media !== undefined) {
		try {
			normalizeMediaQuery(variant.media);
		} catch (e) {
			diagnostics.push({
				level: "error",
				where: `variant "${variant.name}" → media`,
				message: e instanceof Error ? e.message : String(e),
			});
		}
	}

	const rules = variant.rules ?? {};
	const missing = VARIANT_TOKENS.filter((t) => t.required && !rules[t.property]);
	if (missing.length) {
		diagnostics.push({
			level: "warning",
			where: `variant "${variant.name}"`,
			message: `does not define ${missing.length} required token${
				missing.length === 1 ? "" : "s"
			} (${
				missing.map((t) => t.key).join(", ")
			}) — each falls back to a derived value, which is unlikely to be the colour you want`,
		});
	}

	for (const [property, value] of Object.entries(rules)) {
		if (typeof value !== "string") continue;
		for (const reference of findVarReferences(value)) {
			if (defined.has(reference)) continue;
			diagnostics.push({
				level: "warning",
				where: `variant "${variant.name}" → ${property}`,
				message:
					`references ${reference}, which nothing defines — the declaration is invalid at computed-value time, so ${property} silently inherits`,
			});
		}
	}

	return diagnostics;
}

/**
 * Prints diagnostics and decides whether generation may continue.
 *
 * @throws if any diagnostic is an error, or any at all when strict.
 */
export function reportDiagnostics(diagnostics: DripDiagnostic[], themeName: string): void {
	if (!diagnostics.length) return;

	const strict = isStrict();
	const fatal = diagnostics.filter((d) => d.level === "error" || strict);

	for (const { level, where, message } of diagnostics) {
		const label = level === "error" || strict ? "error" : "warning";
		console.error(`Drip [${label}] ${themeName}: ${where} — ${message}`);
	}
	if (!strict && diagnostics.some((d) => d.level === "warning")) {
		console.error(
			`Drip: set BEARMETAL_DRIP_STRICT=1 to make the ${themeName} warnings above fail the build.`,
		);
	}

	if (fatal.length) {
		throw new Error(
			`Drip: ${fatal.length} problem${
				fatal.length === 1 ? "" : "s"
			} in theme "${themeName}" (see above)`,
		);
	}
}
