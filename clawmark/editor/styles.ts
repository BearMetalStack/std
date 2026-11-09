import { token as t } from "./tokens.ts";

/** Typography for rendered markdown, shared by the rich and preview panes. */
const content = `
	.cm-content {
		font-family: ${t("font")};
		font-size: ${t("size")};
		line-height: ${t("leading")};
		overflow-wrap: anywhere;
	}
	.cm-content > :first-child { margin-block-start: 0; }
	.cm-content > :last-child { margin-block-end: 0; }
	.cm-content :is(h1, h2, h3, h4, h5, h6) {
		font-weight: ${t("headingWeight")};
		line-height: 1.25;
		margin-block: 1em 0.4em;
	}
	.cm-content h1 { font-size: ${t("h1")}; }
	.cm-content h2 { font-size: ${t("h2")}; }
	.cm-content h3 { font-size: ${t("h3")}; }
	.cm-content h4 { font-size: ${t("h4")}; }
	.cm-content h5 { font-size: ${t("h5")}; }
	.cm-content h6 { font-size: ${t("h6")}; color: ${t("muted")}; }
	.cm-content p { margin-block: 0 0.8em; }
	.cm-content blockquote {
		margin: 0 0 0.8em;
		padding-inline-start: 1em;
		border-inline-start: 3px solid ${t("quoteBorder")};
		color: ${t("muted")};
	}
	.cm-content blockquote p { margin: 0; }
	.cm-content :is(ul, ol) { margin-block: 0 0.8em; padding-inline-start: 1.6em; }
	.cm-content code {
		font-family: ${t("fontMono")};
		font-size: 0.9em;
		background: ${t("codeBg")};
		padding: 0.1em 0.35em;
		border-radius: ${t("radiusSm")};
		corner-shape: var(--corner-shape, round);
	}
	.cm-content pre {
		margin: 0 0 0.8em;
		padding: ${t("pad")};
		background: ${t("codeBg")};
		border-radius: ${t("radius")};
		corner-shape: var(--corner-shape, round);
		overflow: auto;
	}
	.cm-content pre code { background: none; padding: 0; font-size: 0.875em; }
	.cm-content a { color: ${t("link")}; }
	.cm-content :is(mark, .highlight) {
		background: ${t("highlightBg")};
		color: ${t("highlightColor")};
	}
	.cm-content hr { border: 0; border-block-start: 1px solid ${t("rule")}; margin-block: 1em; }
	.cm-content img { max-width: 100%; }
	.cm-content table { border-collapse: collapse; margin-block-end: 0.8em; }
	.cm-content :is(th, td) { border: 1px solid ${t("rule")}; padding: 0.3em 0.6em; }
`;

const chrome = `
	:host { display: block; }
	[hidden] { display: none !important; }

	.editor {
		display: flex;
		flex-direction: column;
		background: ${t("bg")};
		color: ${t("color")};
		border: 1px solid ${t("border")};
		border-radius: ${t("radius")};
		corner-shape: var(--corner-shape, round);
		overflow: hidden;
	}
	.editor:focus-within {
		border-color: ${t("borderFocus")};
		box-shadow: ${t("shadowFocus")};
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: ${t("gap")};
		padding: calc(${t("gap")} * 0.75) ${t("gap")};
		background: ${t("toolbarBg")};
		border-block-end: 1px solid ${t("border")};
		font-family: ${t("font")};
		font-size: 0.875rem;
	}
	.group { display: flex; gap: 2px; }
	.spacer { flex: 1; }
	.extra {
		display: flex;
		align-items: center;
		gap: 2px;
		align-self: stretch;
		padding-inline-start: ${t("gap")};
		border-inline-start: 1px solid ${t("border")};
	}
	.below { flex: 0 0 100%; }
	slot { display: contents; }

	select, .toolbar button {
		font: inherit;
		color: inherit;
		min-height: 2em;
		padding: 0 0.6em;
		background: transparent;
		border: 1px solid transparent;
		border-radius: ${t("radiusSm")};
		corner-shape: var(--corner-shape, round);
		cursor: pointer;
	}
	select { background: ${t("bg")}; border-color: ${t("border")}; }
	.toolbar button:hover { background: ${t("toggleHover")}; }
	.toolbar button:focus-visible, select:focus-visible {
		outline: none;
		box-shadow: ${t("shadowFocus")};
	}
	.toolbar button[aria-pressed="true"],
	.toolbar button[aria-selected="true"] {
		background: ${t("toggleActiveBg")};
		color: ${t("toggleActiveColor")};
	}
	[data-key="bold"] { font-weight: 700; }
	[data-key="italic"] { font-style: italic; }
	[data-key="underline"] { text-decoration: underline; }
	[data-key="strike"] { text-decoration: line-through; }
	[data-key="code"] { font-family: ${t("fontMono")}; }

	:host(:not([view="rich"])) .rich-only { opacity: 0.4; pointer-events: none; }

	.link-row { display: flex; gap: ${t("gap")}; padding: ${t("gap")}; border-block-end: 1px solid ${
	t("border")
}; }
	.link-row input {
		flex: 1;
		font: inherit;
		color: inherit;
		background: ${t("bg")};
		border: 1px solid ${t("border")};
		border-radius: ${t("radiusSm")};
		padding: 0.25em 0.5em;
	}

	[data-pane] { display: none; min-height: ${t("minHeight")}; padding: ${
	t("pad")
}; box-sizing: border-box; }
	:host([view="rich"]) [data-pane="rich"],
	:host([view="preview"]) [data-pane="preview"] { display: block; }
	:host([view="raw"]) [data-pane="raw"] { display: block; }

	[data-pane="rich"] { outline: none; }
	[data-pane="rich"][data-empty]::before {
		content: attr(data-placeholder);
		color: ${t("muted")};
		pointer-events: none;
		position: absolute;
	}
	textarea[data-pane] {
		width: 100%;
		resize: vertical;
		border: 0;
		outline: none;
		background: transparent;
		color: inherit;
		font-family: ${t("fontMono")};
		font-size: 0.9em;
		line-height: ${t("leading")};
	}
`;

/** The editor's whole shadow-root stylesheet. */
export const editorStyles: string = chrome + content;
