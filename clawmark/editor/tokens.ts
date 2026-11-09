/**
 * The editor's design tokens. Each one is a `--cm-<name>` custom property a
 * page can set; when it is not set, it falls back to the Drip token named here,
 * and when Drip is not loaded either, to the literal. Custom properties cross a
 * shadow boundary, so setting any of these on the element or an ancestor styles
 * the editor from outside.
 *
 * `[name, drip token, literal]`
 */
export const editorTokens = {
	// Chrome
	bg: ["--input-bg", "#fff"],
	color: ["--color-text", "#1e2430"],
	muted: ["--color-text-muted", "#6b7280"],
	border: ["--input-border", "#c9ced6"],
	borderFocus: ["--input-border-focus", "#4f6df5"],
	shadowFocus: ["--input-shadow-focus", "0 0 0 3px rgb(79 109 245 / 0.25)"],
	radius: ["--input-radius", "8px"],
	radiusSm: ["--radius-sm", "4px"],
	toolbarBg: ["--color-surface-raised", "#f5f6f8"],
	toggleHover: ["--color-interactive-subtle", "#e6e9ef"],
	toggleActiveBg: ["--color-interactive", "#4f6df5"],
	toggleActiveColor: ["--color-text-on-brand", "#fff"],
	gap: ["--space-2", "0.5rem"],
	pad: ["--space-3", "0.75rem"],
	minHeight: ["--space-32", "10rem"],
	// Content
	font: ["--font-body", "system-ui, sans-serif"],
	fontMono: ["--font-mono", "ui-monospace, monospace"],
	size: ["--text-base", "1rem"],
	leading: ["--leading-normal", "1.6"],
	h1: ["--text-3xl", "1.875rem"],
	h2: ["--text-2xl", "1.5rem"],
	h3: ["--text-xl", "1.25rem"],
	h4: ["--text-lg", "1.125rem"],
	h5: ["--text-base", "1rem"],
	h6: ["--text-sm", "0.875rem"],
	headingWeight: ["--weight-bold", "700"],
	quoteBorder: ["--color-border-strong", "#9aa3b2"],
	codeBg: ["--color-bg-muted", "#eef0f4"],
	link: ["--color-accent", "#3451d1"],
	highlightBg: ["--color-highlight-bg", "#fff3a3"],
	highlightColor: ["--color-highlight-text", "inherit"],
	rule: ["--color-border", "#c9ced6"],
} as const satisfies Record<string, readonly [string, string]>;

export type EditorToken = keyof typeof editorTokens;

/** `var(--cm-name, var(--drip-token, literal))` for use inside the editor's stylesheet. */
export function token(name: EditorToken): string {
	const [drip, literal] = editorTokens[name];
	return `var(--cm-${name}, var(${drip}, ${literal}))`;
}
