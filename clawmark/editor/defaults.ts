import type { EditorMeta } from "./types.ts";

const tagIs = (...tags: string[]) => (el: Element) => tags.includes(el.localName);

const heading = (level: number): EditorMeta => ({
	key: `h${level}`,
	kind: "block",
	label: `Heading ${level}`,
	element: { tag: `h${level}` },
	is: tagIs(`h${level}`),
	order: 10 + level,
});

/**
 * Editor metadata for the default rules, keyed by rule id. Tables, images and
 * footnotes are deliberately absent: they are displayed and round-tripped but
 * not authored from the toolbar.
 */
export const defaultEditorMeta: Record<string, EditorMeta | EditorMeta[]> = {
	"core:paragraph": {
		key: "p",
		kind: "block",
		label: "Paragraph",
		element: { tag: "p" },
		is: tagIs("p"),
		order: 0,
	},
	"md:heading": [1, 2, 3, 4, 5, 6].map(heading),
	"md:blockquote": {
		key: "quote",
		kind: "block",
		label: "Quote",
		element: { tag: "blockquote" },
		is: tagIs("blockquote"),
		order: 20,
	},
	"md:codeblock": {
		key: "codeblock",
		kind: "block",
		label: "Code block",
		element: { tag: "pre" },
		is: tagIs("pre"),
		order: 21,
	},
	"md:unorderedlist": {
		key: "ul",
		kind: "block",
		label: "Bulleted list",
		element: { tag: "ul" },
		is: tagIs("ul"),
		order: 22,
	},
	"md:orderedlist": {
		key: "ol",
		kind: "block",
		label: "Numbered list",
		element: { tag: "ol" },
		is: tagIs("ol"),
		order: 23,
	},
	"md:hr": {
		key: "hr",
		kind: "block",
		label: "Divider",
		element: { tag: "hr" },
		is: tagIs("hr"),
		order: 24,
	},
	"md:bold": {
		key: "bold",
		kind: "inline",
		label: "Bold",
		icon: "B",
		element: { tag: "strong" },
		is: tagIs("strong", "b"),
		shortcut: "Mod+B",
		order: 0,
	},
	"md:italic": {
		key: "italic",
		kind: "inline",
		label: "Italic",
		icon: "I",
		element: { tag: "em" },
		is: tagIs("em", "i"),
		shortcut: "Mod+I",
		order: 1,
	},
	"md:underline": {
		key: "underline",
		kind: "inline",
		label: "Underline",
		icon: "U",
		element: { tag: "u" },
		is: tagIs("u", "ins"),
		shortcut: "Mod+U",
		order: 2,
	},
	"md:strikethrough": {
		key: "strike",
		kind: "inline",
		label: "Strikethrough",
		icon: "S",
		element: { tag: "s" },
		is: tagIs("s", "del", "strike"),
		shortcut: "Mod+Shift+X",
		order: 3,
	},
	"md:highlight": {
		key: "highlight",
		kind: "inline",
		label: "Highlight",
		icon: "H",
		element: { tag: "span", attrs: { class: "highlight" } },
		is: (el) => el.localName === "mark" || el.matches("span.highlight"),
		order: 4,
	},
	"md:code": {
		key: "code",
		kind: "inline",
		label: "Inline code",
		icon: "</>",
		element: { tag: "code" },
		is: (el) => el.localName === "code" && el.parentElement?.localName !== "pre",
		shortcut: "Mod+E",
		order: 5,
	},
	"md:link": {
		key: "link",
		kind: "inline",
		label: "Link",
		icon: "Link",
		element: { tag: "a" },
		is: tagIs("a"),
		shortcut: "Mod+K",
		order: 6,
		prompt: { attr: "href", label: "Link address" },
	},
};
