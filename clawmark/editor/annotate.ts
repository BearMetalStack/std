import type { AnyRule, StagedRule } from "../types.ts";
import { defaultEditorMeta } from "./defaults.ts";
import type { AnyWysiwygRule, EditorMeta } from "./types.ts";

/** Attaches editor metadata to `rule`, making it a toolbar-visible rule. */
export function withEditor(
	rule: AnyRule,
	editor: EditorMeta | EditorMeta[],
): AnyWysiwygRule {
	return { ...rule, editor };
}

export function isWysiwygRule(rule: StagedRule): rule is AnyWysiwygRule {
	return "editor" in rule && rule.editor != null;
}

/**
 * Annotates `rules` with editor metadata by rule id. `overrides` is checked
 * before the defaults, so a caller can relabel, reorder or replace an entry
 * (or pass `[]` to hide a rule from the toolbar). Rules with no metadata, and
 * rules that already carry some, pass through untouched; they still parse,
 * render and serialize, they just have no toolbar entry.
 */
export function editorRules(
	rules: StagedRule[],
	overrides: Record<string, EditorMeta | EditorMeta[]> = {},
): StagedRule[] {
	return rules.map((rule) => {
		if (isWysiwygRule(rule)) return rule;
		const meta = overrides[rule.id] ?? defaultEditorMeta[rule.id];
		if (meta === undefined || (Array.isArray(meta) && meta.length === 0)) return rule;
		return { ...rule, editor: meta } as AnyWysiwygRule;
	});
}

/** Every editor entry in `rules`, flattened and sorted: blocks and inlines separately. */
export function collectMeta(rules: StagedRule[]): { blocks: EditorMeta[]; inlines: EditorMeta[] } {
	const all: EditorMeta[] = [];
	for (const rule of rules) {
		if (!isWysiwygRule(rule)) continue;
		all.push(...(Array.isArray(rule.editor) ? rule.editor : [rule.editor]));
	}
	const byOrder = (a: EditorMeta, b: EditorMeta) => (a.order ?? 0) - (b.order ?? 0);
	return {
		blocks: all.filter((m) => m.kind === "block").sort(byOrder),
		inlines: all.filter((m) => m.kind === "inline").sort(byOrder),
	};
}
