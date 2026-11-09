/**
 * @module
 * A markdown editor for clawmark: rich, raw and preview views over one
 * markdown value, with a toolbar derived from the rules in use.
 *
 * This is a web component built on `@bearmetal/app`, so it belongs in an app's
 * client bundle rather than a standalone page. Importing this module defines
 * `<cm-editor>` with the default rule set; use {@link defineEditor} for any
 * other rule set or tag.
 */

import { defineEditor } from "./define.ts";

import { ClawmarkEditor } from "./Editor.tsx";

export { ClawmarkEditor };
export { defineEditor } from "./define.ts";
export type { DefineEditorOptions } from "./define.ts";
export { collectMeta, editorRules, isWysiwygRule, withEditor } from "./annotate.ts";
export { defaultEditorMeta } from "./defaults.ts";
export { markdownToRich, richToMarkdown, sanitizeHtml } from "./convert.ts";
export { editorStyles } from "./styles.ts";
export { type EditorToken, editorTokens, token } from "./tokens.ts";
export type * from "./types.ts";

/** The default editor, `<cm-editor>`, over `defaultRules()`. */
export const ClawmarkDefaultEditor: typeof ClawmarkEditor = defineEditor("cm-editor");
