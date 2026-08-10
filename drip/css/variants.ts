import { emitCalcCSS } from "./calc.ts";
import type { CalcNode, Theme, Variant } from "../types.ts";
import { completeVariantRules } from "./tokens.ts";
import { normalizeMediaQuery } from "./validate.ts";
import { indent } from "@bearmetal/miscellanea";

/**
 * A theme's variants, whichever key they are stored under.
 *
 * `variants` is the current spelling; `#variants` is the original one and is
 * still read so existing theme files keep working. Variants are returned with
 * the default first, which is the order they have to be emitted in.
 */
export function getThemeVariants(theme: Theme): Variant[] {
	const stored = (theme.variants ?? theme["#variants"]) as Variant[] | undefined;
	if (!Array.isArray(stored)) return [];
	return stored.toSorted((a, b) => Number(b.default ?? false) - Number(a.default ?? false));
}

/** Options for {@linkcode buildVariantsCss}. */
export interface BuildVariantsOptions {
	/** Selector each variant block hangs off. Defaults to `:root`. */
	selector?: string;
	/** Separator between declarations. Newline unless the output is being minified. */
	joiner?: string;
}

/**
 * Emits the variant blocks for a theme: the default variant, any media-query
 * blocks, and one explicit `[data-theme]` block per variant.
 *
 * Three things are load-bearing here.
 *
 * - Every variant is completed against the token manifest first, so a variant
 *   that skipped a slot still gets a predictable value rather than nothing.
 * - The default variant's rules are emitted once, against a grouped selector,
 *   rather than duplicated into `:root` and `:root[data-theme="…"]`.
 * - A media block excludes every *other* variant's `data-theme` value, so an
 *   explicit choice beats the OS preference by intent instead of by a
 *   specificity accident that the next selector tweak would undo.
 */
export function buildVariantsCss(
	theme: Theme,
	selectorOrOptions: string | BuildVariantsOptions = ":root",
): string {
	const options: BuildVariantsOptions = typeof selectorOrOptions === "string"
		? { selector: selectorOrOptions }
		: selectorOrOptions;
	const selector = options.selector ?? ":root";
	const joiner = options.joiner ?? "\n";

	const variants = getThemeVariants(theme);
	const names = variants.map((v) => v.name);

	return variants.flatMap((variant) => {
		const compiled = variant.__compiled = compileVariant(variant, joiner);
		const own = `${selector}[data-theme="${variant.name}"]${
			selector === ":root" ? `, [data-theme=${variant.name}]` : ""
		}`;
		const sections: string[] = [];

		if (variant.default) {
			sections.push(block(`${selector}, ${own}`, compiled, joiner));
		}

		if (variant.media) {
			const guarded = names
				.filter((name) => name !== variant.name)
				.reduce(
					(sel, name) => `${sel}:not([data-theme="${name}"])`,
					selector,
				);
			sections.push(
				`@media ${normalizeMediaQuery(variant.media)} {${joiner}${
					indent(block(guarded, compiled, joiner))
				}${joiner}}`,
			);
		}

		if (!variant.default) sections.push(block(own, compiled, joiner));
		return sections;
	}).join(joiner + joiner);
}

function block(selector: string, body: string, joiner: string): string {
	return `${selector} {${joiner}${body}${joiner}}`;
}

function compileVariant(variant: Variant, joiner: string): string {
	const rules = completeVariantRules(variant.rules ?? {});
	return indent(
		Object.entries(rules)
			.map(([property, value]) => `${property}: ${resolveValueCSS(value)};`.replace(";;", ";"))
			.join(joiner),
	);
}

function resolveValueCSS(v: string | CalcNode) {
	if (typeof v === "object" && v["$calc"]) return emitCalcCSS(v);
	else if (typeof v === "string" && v.startsWith("$")) {
		return `var(${v.replace("$", "--").replaceAll(".", "-")})`;
	}
	return v;
}

/**
 * Every custom property the theme's variants define, including the ones filled
 * in by derivation. Used to seed reference validation, since a variant rule may
 * legitimately point at a slot only another variant rule creates.
 */
export function variantDefinedProperties(theme: Theme): Set<string> {
	const defined = new Set<string>();
	for (const variant of getThemeVariants(theme)) {
		for (const property of Object.keys(completeVariantRules(variant.rules ?? {}))) {
			defined.add(property);
		}
	}
	return defined;
}
