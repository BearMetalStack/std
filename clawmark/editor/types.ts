import type { Rule } from "../types.ts";

/** The element the rich view creates for a construct. */
export interface EditorElement {
	tag: string;
	attrs?: Record<string, string>;
}

/**
 * What a toolbar needs to know about one authorable construct. A rule can
 * carry several (`md:heading` carries one per level), each with its own `key`.
 */
export interface EditorMeta {
	/** Unique across the whole rule set; the select's option value / toggle id. */
	key: string;
	kind: "block" | "inline";
	label: string;
	/** Short glyph or text shown in an inline toggle. Falls back to `label`. */
	icon?: string;
	/** The element the rich view creates when this style is applied. */
	element: EditorElement;
	/** Whether `el` is an instance of this style. Drives toggle and select state. */
	is(el: Element): boolean;
	/** e.g. `"Mod+B"`; `Mod` is Cmd on macOS and Ctrl elsewhere. */
	shortcut?: string;
	/** Toolbar sort order, ascending. Defaults to registration order. */
	order?: number;
	/** Inline only: an argument to collect before applying (a link's URL). */
	prompt?: { attr: string; label: string };
}

/** A clawmark rule that also says how it appears in the editor. */
export type WysiwygRule<T = Record<string, unknown>> = Rule<T> & {
	editor: EditorMeta | EditorMeta[];
};
// deno-lint-ignore no-explicit-any
export type AnyWysiwygRule = WysiwygRule<any>;

/** The active styles at the caret or selection. */
export interface ActiveState {
	/** `key` of the innermost block style, if any. */
	block?: string;
	/** `key`s of every inline style the whole selection sits inside. */
	inlines: Set<string>;
}

/** Which of the editor's three views is showing. */
export type EditorView = "rich" | "raw" | "preview";

export interface EditorChangeDetail {
	value: string;
}
