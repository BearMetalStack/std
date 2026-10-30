/**
 * @module
 * Which rule claimed which source: the first question in debugging a rule pack.
 */

import type { AnyRule, Span, StagedRule, Token, TokenIdentifier } from "./types.ts";
import { isForwardRule } from "./types.ts";

/** One `tokenize` call: the rule that won, the tokens it emitted, and what it consumed. */
export interface RuleTrace extends Span {
	rule: TokenIdentifier;
	tags: TokenIdentifier[];
}

/**
 * Copies `rules`, recording every `tokenize` call they make, in order. Hand the
 * returned `rules` to `parse`; `traces` fills in as the parse runs. Only the
 * rule that won its trigger character is recorded, since `validate` is called
 * on every candidate. Spans are document positions, the same ones `Node.span`
 * carries, nested parses (link text, a table cell) included.
 *
 * Like `defaultRules()`, the copy is for one parse; preparse and postparse
 * rules pass through untouched.
 */
export function traceRules<R extends StagedRule>(
	rules: readonly R[],
): { rules: R[]; traces: RuleTrace[] } {
	const traces: RuleTrace[] = [];
	const traced = rules.map((rule): R => {
		if (!isForwardRule(rule)) return rule;
		const forward = rule as AnyRule;
		return {
			...forward,
			tokenize(ctx) {
				const start = ctx.offset + ctx.cursor;
				const result = forward.tokenize(ctx);
				const tokens: Token[] = Array.isArray(result) ? result : [result];
				traces.push({
					rule: forward.id,
					tags: tokens.map((token) => token.tag),
					start,
					end: ctx.offset + ctx.cursor + 1,
				});
				return result;
			},
		} as R;
	});
	return { rules: traced, traces };
}
