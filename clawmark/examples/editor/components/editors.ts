import { defaultRules } from "@bearmetal/clawmark";
import { defineEditor } from "@bearmetal/clawmark/editor";

// Importing "@bearmetal/clawmark/editor" already defines <cm-editor>. A second tag
// shows the factory: same rules, but the toolbar drops everything except bold/italic.
export const NoteEditor = defineEditor("note-editor", {
	rules: defaultRules(),
	meta: {
		"md:underline": [],
		"md:strikethrough": [],
		"md:highlight": [],
		"md:code": [],
	},
});
