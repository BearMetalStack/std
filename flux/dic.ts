/**
 * @module
 * Single-pass `.dic` (Hunspell dictionary file) parser and affix expansion.
 *
 * Feeds directly off the `Suffixes`/`Prefixes` tables built from the paired `.aff` file, producing
 * a flat `Set<string>` of every valid surface form (stems + all expanded affix forms). No
 * provenance tracking — see ROADMAP.md.
 */

import type { AffixRule, AffixTable, Prefixes, Suffixes } from "./aff.ts";
import { type FlagMode, parseFlags } from "./flags.ts";

export interface ParseDicOptions {
	suffixes: Suffixes;
	prefixes: Prefixes;
	flagMode: FlagMode;
}

/**
 * Splits a `.dic` line's word from its flags at the first unescaped `/`.
 * `\/` inside the word is an escaped literal slash, not a flag delimiter.
 */
function splitWordAndFlags(entry: string): { word: string; flagsRaw: string } {
	let slashIndex = -1;
	for (let i = 0; i < entry.length; i++) {
		if (entry[i] === "/" && entry[i - 1] !== "\\") {
			slashIndex = i;
			break;
		}
	}
	if (slashIndex === -1) {
		return { word: entry.replace(/\\\//g, "/"), flagsRaw: "" };
	}
	return {
		word: entry.slice(0, slashIndex).replace(/\\\//g, "/"),
		flagsRaw: entry.slice(slashIndex + 1),
	};
}

function applySuffix(word: string, rule: AffixRule): string {
	const base = rule.strip ? word.slice(0, word.length - rule.strip.length) : word;
	return base + rule.add;
}

function applyPrefix(word: string, rule: AffixRule): string {
	const base = rule.strip ? word.slice(rule.strip.length) : word;
	return rule.add + base;
}

function applyBoth(word: string, prefixRule: AffixRule, suffixRule: AffixRule): string {
	let base = word;
	if (prefixRule.strip) base = base.slice(prefixRule.strip.length);
	if (suffixRule.strip) base = base.slice(0, base.length - suffixRule.strip.length);
	return prefixRule.add + base + suffixRule.add;
}

function expandWord(
	word: string,
	flags: string[],
	suffixes: Suffixes,
	prefixes: Prefixes,
	lookup: Set<string>,
) {
	lookup.add(word);

	const matchedSuffixes: { table: AffixTable; rule: AffixRule }[] = [];
	const matchedPrefixes: { table: AffixTable; rule: AffixRule }[] = [];

	for (const flag of flags) {
		const suffixTable = suffixes.get(flag);
		if (suffixTable) {
			for (const rule of suffixTable.rules) {
				if (rule.condition.test(word)) {
					lookup.add(applySuffix(word, rule));
					matchedSuffixes.push({ table: suffixTable, rule });
				}
			}
		}

		const prefixTable = prefixes.get(flag);
		if (prefixTable) {
			for (const rule of prefixTable.rules) {
				if (rule.condition.test(word)) {
					lookup.add(applyPrefix(word, rule));
					matchedPrefixes.push({ table: prefixTable, rule });
				}
			}
		}
	}

	for (const { table: prefixTable, rule: prefixRule } of matchedPrefixes) {
		if (!prefixTable.crossProduct) continue;
		for (const { table: suffixTable, rule: suffixRule } of matchedSuffixes) {
			if (!suffixTable.crossProduct) continue;
			lookup.add(applyBoth(word, prefixRule, suffixRule));
		}
	}
}

export function parseDic(text: string, options: ParseDicOptions): Set<string> {
	const { suffixes, prefixes, flagMode } = options;
	const lines = text.split(/\r?\n/);
	const lookup = new Set<string>();

	// lines[0] is the word-count hint — a hint only, not an authoritative bound; skip it.
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined || line.trim().length === 0) continue;

		const tabIndex = line.indexOf("\t");
		const entry = tabIndex === -1 ? line : line.slice(0, tabIndex);

		const { word, flagsRaw } = splitWordAndFlags(entry);
		if (word.length === 0) continue;
		const flags = parseFlags(flagsRaw, flagMode);

		expandWord(word, flags, suffixes, prefixes, lookup);
	}

	return lookup;
}
