import { define } from "@bearmetal/app";
import { defaultRules } from "../rules/mod.ts";
import type { StagedRule } from "../types.ts";
import { editorRules } from "./annotate.ts";
import { ClawmarkEditor } from "./Editor.tsx";
import type { EditorMeta } from "./types.ts";

export interface DefineEditorOptions {
	/**
	 * The rule set. Rules without editor metadata still parse and round-trip but
	 * get no toolbar entry, so pass them through `editorRules()` or `withEditor()`.
	 * Defaults to `editorRules(defaultRules())`.
	 */
	rules?: StagedRule[];
	/** Relabel, reorder or hide default toolbar entries by rule id (see `editorRules`). */
	meta?: Record<string, EditorMeta | EditorMeta[]>;
}

/**
 * Registers an editor element named `tag` and returns its class.
 *
 * Rules are functions and cannot be passed as attributes, so a rule set
 * reaches the editor by being the one the class was defined with. Call this at
 * module scope in a file the app bundles (an `@components` file, or one named
 * by a `*.manifest.ts`) and name the tag in views; do not import the class
 * into a view, which is server-only.
 *
 * @example
 * ```ts
 * export const NoteEditor = defineEditor("note-editor", {
 *   rules: [...defaultRules(), wikiLinkRule()],
 * });
 * ```
 */
export function defineEditor(
	tag: string,
	options: DefineEditorOptions = {},
): typeof ClawmarkEditor {
	const rules = editorRules(options.rules ?? defaultRules(), options.meta);

	@define(tag)
	class Editor extends ClawmarkEditor {
		static override rules = rules;
	}

	return Editor;
}
