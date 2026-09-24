import { cliConfirm, cliPrompt, multiSelectMenuInteractive } from "@bearmetal/cli";
import { colorize } from "@bearmetal/cli/style";
import {
	deriveValue,
	type Theme,
	type Variant,
	VARIANT_TOKENS,
	VARIANT_TOKENS_BY_KEY,
	type VariantTokenDef,
	variantTokensByGroup,
} from "@bearmetal/drip";
import { accessorResolves, parseDripValue } from "./dripValues.ts";

/** Converts a wizard answer (raw CSS or a `$color.path.stop` accessor) into the stored CSS value. */
function resolveAnswer(theme: Theme, answer: string): string {
	if (!answer.startsWith("$")) return answer;
	if (!accessorResolves(theme, answer)) {
		console.log(
			colorize(
				`  "${answer}" doesn't resolve to anything in this theme yet — stored as typed, but the declaration will be invalid until it does.`,
				"yellow",
			),
		);
	}
	return parseDripValue(answer);
}

async function promptTokenValue(
	theme: Theme,
	token: VariantTokenDef,
	suggestion: string,
): Promise<string> {
	const answer = await cliPrompt(`${token.description} (${token.property})`, suggestion);
	return resolveAnswer(theme, answer || suggestion);
}

/**
 * Prompts for every {@linkcode VARIANT_TOKENS} entry, in manifest order, so
 * earlier answers can inform later suggestions the way `completeVariantRules`
 * does at generate time — except here the author sees and can override each
 * one, rather than it happening silently. The default variant is the one
 * every other variant's unset tokens fall through to (via the cascade), so it
 * has to define all of them, not just the required subset.
 */
export async function promptDefaultVariant(theme: Theme): Promise<Variant> {
	console.log(
		`\nNow let's set the ${
			colorize("default", "green")
		} variant. Every token needs a value here — every other variant you add will fall back to whatever this one sets for anything it doesn't override itself.`,
	);
	const name = await cliPrompt("What should this variant be called?", "light");
	const rules: Record<string, string> = {};
	for (const token of VARIANT_TOKENS) {
		const suggestion = deriveValue(token, rules) ?? token.fallback ?? "";
		rules[token.property] = await promptTokenValue(theme, token, suggestion);
	}
	return { name, default: true, rules };
}

/**
 * Prompts for an additional variant (dark mode, high contrast, ...): a name,
 * an optional media query, and *only* the tokens that change — picked with a
 * multi-select over the manifest, grouped and printed with descriptions
 * first since the list is long. Everything left unpicked inherits the
 * default variant's value through the CSS cascade; it does not need to be
 * copied here.
 */
export async function promptAdditionalVariant(
	theme: Theme,
	defaultVariant: Variant,
): Promise<Variant> {
	const name = await cliPrompt('What should this variant be called? (e.g. "dark")');
	const mediaAnswer = await cliPrompt(
		"Media query that should trigger it automatically, e.g. (prefers-color-scheme: dark) — leave blank for none",
		"",
	);
	const media = mediaAnswer.trim() || undefined;

	console.log(
		"\nHere's every token this theme knows about. Pick the ones that change for this variant — everything else inherits the default variant's value:\n",
	);
	const options: string[] = [];
	for (const [group, tokens] of variantTokensByGroup()) {
		console.log(colorize(group, "green") + ":");
		for (const t of tokens) {
			console.log(`  ${t.key} — ${t.description}`);
			options.push(t.key);
		}
	}
	const picked = await multiSelectMenuInteractive(
		`Which tokens change in "${name}"?`,
		options,
	) ?? [];

	const rules: Record<string, string> = {};
	for (const key of picked) {
		const token = VARIANT_TOKENS_BY_KEY.get(key);
		if (!token) continue;
		const fromDefault = defaultVariant.rules[token.property];
		const suggestion = typeof fromDefault === "string" ? fromDefault : "";
		rules[token.property] = await promptTokenValue(theme, token, suggestion);
	}
	return { name, media, rules };
}

/** Loops offering to add another variant until the author declines. */
export async function promptAdditionalVariants(
	theme: Theme,
	defaultVariant: Variant,
): Promise<Variant[]> {
	const variants: Variant[] = [];
	while (await cliConfirm("Add another variant (e.g. dark mode)?", false)) {
		variants.push(await promptAdditionalVariant(theme, defaultVariant));
	}
	return variants;
}
