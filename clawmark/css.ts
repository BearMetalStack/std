/**
 * @module
 * A CSS subset, in both directions: stylesheet text to `StyleBlock`s, and
 * `StyleBlock`s back to stylesheet text.
 *
 * The subset is narrow on purpose. Everything here has to survive the trip into
 * WordprocessingML and ODF, which have no cascade, no selectors, and no
 * relative units - so a class rule is the only shape with a meaning all three
 * formats share. Descendant selectors, `@media`, and pseudo-classes are skipped
 * with a warning rather than half-honored.
 *
 * ```ts
 * const styles = createDocumentStyles().fromCss(`
 * 	.scene-break  { text-align: center; margin-top: 1.5em; font-style: italic; }
 * 	.chapter-head { break-before: page; font-size: 24pt; }
 * `);
 *
 * toCss(styles); // the same rules, regenerated
 * ```
 *
 * The generator is also the entry point for the web-component case, where the
 * output is handed straight to a constructable stylesheet:
 *
 * ```ts
 * const sheet = new CSSStyleSheet();
 * sheet.replaceSync(toCss(styles));
 * shadowRoot.adoptedStyleSheets = [sheet];
 * ```
 */

import { toPascalCase } from "@bearmetal/miscellanea/string";
import type { BreakKind, DocumentStyles, ResolvedStyle, StyleBlock } from "./types.ts";

export interface CssParseOptions {
	onWarn?(message: string): void;
}

/**
 * Parses a declaration block (`color: red; font-size: 12pt`) into a property
 * map, lowercasing property names and stripping `!important`.
 *
 * Shared by the stylesheet parser and the HTML read profile's inline `style=`
 * handling - there is one CSS declaration parser in this package, not two.
 */
export function parseDeclarations(value: string | undefined): Map<string, string> {
	const out = new Map<string, string>();
	if (!value) return out;
	for (const decl of splitTop(value, ";")) {
		const colon = decl.indexOf(":");
		if (colon < 0) continue;
		const property = decl.slice(0, colon).trim().toLowerCase();
		if (property === "") continue;
		out.set(property, decl.slice(colon + 1).replace(/!\s*important\s*$/i, "").trim());
	}
	return out;
}

/**
 * Splits on a separator that is not inside quotes, parentheses, or brackets, so
 * `font-family: "Foo, Bar", serif` and `color: rgb(1, 2, 3)` survive intact.
 */
function splitTop(value: string, separator: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let quote: string | undefined;
	let start = 0;

	for (let i = 0; i < value.length; i++) {
		const char = value[i];
		if (quote !== undefined) {
			if (char === "\\") i++;
			else if (char === quote) quote = undefined;
			continue;
		}
		if (char === '"' || char === "'") quote = char;
		else if (char === "(" || char === "[") depth++;
		else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
		else if (char === separator && depth === 0) {
			out.push(value.slice(start, i));
			start = i + 1;
		}
	}
	out.push(value.slice(start));
	return out;
}

/** Strips block comments without touching string literals. */
function stripComments(source: string): string {
	let out = "";
	let quote: string | undefined;
	for (let i = 0; i < source.length; i++) {
		const char = source[i];
		if (quote !== undefined) {
			out += char;
			if (char === "\\") out += source[++i] ?? "";
			else if (char === quote) quote = undefined;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			out += char;
			continue;
		}
		if (char === "/" && source[i + 1] === "*") {
			const end = source.indexOf("*/", i + 2);
			if (end < 0) break;
			i = end + 1;
			continue;
		}
		out += char;
	}
	return out;
}

// ---- CSS -> StyleBlock ----------------------------------------------------

const ALIGN: Record<string, NonNullable<ResolvedStyle["align"]>> = {
	left: "l",
	start: "l",
	center: "c",
	centre: "c",
	right: "r",
	end: "r",
	justify: "j",
};

const TRANSFORMS = new Set(["none", "uppercase", "lowercase", "capitalize"]);

/**
 * Clawmark-specific properties, spelled as CSS custom properties so a
 * stylesheet carrying them is still valid CSS a browser will ignore rather than
 * choke on.
 */
const CUSTOM = {
	role: "--clawmark-role",
	element: "--clawmark-element",
	family: "--clawmark-family",
	next: "--clawmark-next",
	basedOn: "--clawmark-based-on",
} as const;

const ROLES = new Set(["heading", "paragraph", "quote", "code", "list", "table"]);

/** Expands the 1-to-4 value margin shorthand into its four sides. */
function expandBox(value: string): { top: string; right: string; bottom: string; left: string } {
	const parts = value.trim().split(/\s+/);
	const [top, right = top, bottom = top, left = right] = parts;
	return { top, right, bottom, left };
}

function breakValue(value: string): BreakKind | undefined {
	const normalized = value.trim().toLowerCase();
	if (normalized === "page" || normalized === "always" || normalized === "left") return "page";
	if (normalized === "column") return "column";
	return undefined;
}

/**
 * Applies one declaration to a block. Returns false when nothing understood it,
 * so the caller can park it in `StyleBlock.css` for the HTML output.
 */
function applyDeclaration(block: StyleBlock, property: string, value: string): boolean {
	const lower = value.trim().toLowerCase();

	switch (property) {
		case "font-family":
			block.fontFamily = value.trim();
			return true;
		case "font-size":
			block.fontSize = value.trim();
			return true;
		case "font-weight":
			block.fontWeight = /^\d+$/.test(lower) ? Number(lower) : lower === "bold" ? "bold" : "normal";
			return true;
		case "font-style":
			block.fontStyle = /^(italic|oblique)/.test(lower) ? "italic" : "normal";
			return true;
		case "font-variant":
		case "font-variant-caps":
			block.smallCaps = lower.includes("small-caps");
			return true;
		case "color":
			block.color = value.trim();
			return true;
		case "background":
		case "background-color":
			block.background = value.trim();
			return true;
		case "text-transform":
			if (!TRANSFORMS.has(lower)) return false;
			block.textTransform = lower as StyleBlock["textTransform"];
			return true;
		case "letter-spacing":
			block.letterSpacing = value.trim();
			return true;
		case "text-decoration":
		case "text-decoration-line":
			block.underline = /underline/.test(lower);
			block.strike = /line-through/.test(lower);
			return true;
		case "text-align":
			if (ALIGN[lower] === undefined) return false;
			block.align = ALIGN[lower];
			return true;
		case "line-height":
			block.lineHeight = /^\d*\.?\d+$/.test(lower) ? Number(lower) : value.trim();
			return true;
		case "margin-top":
			block.spaceBefore = value.trim();
			return true;
		case "margin-bottom":
			block.spaceAfter = value.trim();
			return true;
		case "margin-left":
			block.indentLeft = value.trim();
			return true;
		case "margin-right":
			block.indentRight = value.trim();
			return true;
		case "margin": {
			const box = expandBox(value);
			block.spaceBefore = box.top;
			block.spaceAfter = box.bottom;
			block.indentLeft = box.left;
			block.indentRight = box.right;
			return true;
		}
		case "text-indent":
			block.textIndent = value.trim();
			return true;
		case "break-before":
		case "page-break-before":
			block.breakBefore = breakValue(lower);
			return block.breakBefore !== undefined || lower === "auto";
		case "break-after":
		case "page-break-after":
			// `avoid` is CSS's way of saying "keep with the next block", which is
			// what both office formats call it.
			if (lower === "avoid") {
				block.keepWithNext = true;
				return true;
			}
			block.breakAfter = breakValue(lower);
			return block.breakAfter !== undefined || lower === "auto";
		case "break-inside":
		case "page-break-inside":
			block.keepTogether = lower === "avoid";
			return true;
		case "widows":
		case "orphans":
			block.widowControl = Number(lower) > 1;
			return true;
		case CUSTOM.role:
			if (!ROLES.has(lower)) return false;
			block.role = lower as StyleBlock["role"];
			return true;
		case CUSTOM.element:
			block.element = lower;
			return true;
		case CUSTOM.family:
			block.family = lower === "text" ? "text" : "paragraph";
			return true;
		case CUSTOM.next:
			block.nextStyle = toPascalCase(value.trim());
			return true;
		case CUSTOM.basedOn:
			block.basedOn = toPascalCase(value.trim());
			return true;
		default:
			return false;
	}
}

/** `.scene-break` / `p.verse` - a single class, optionally qualified by a tag. */
const SELECTOR_RX = /^([a-z][a-z0-9]*)?\.(-?[_a-z][\w-]*)$/i;

/**
 * Parses a stylesheet into named style blocks.
 *
 * The style *name* is the PascalCase of the class - `.scene-break` becomes
 * `SceneBreak` - and the original class is kept on the block, so
 * `classFor(name)` hands back exactly what the stylesheet was written with.
 */
export function parseStyleSheet(
	source: string,
	options: CssParseOptions = {},
): (readonly [string, StyleBlock])[] {
	const warn = (message: string) => options.onWarn?.(`css: ${message}`);
	const text = stripComments(source);
	const out: (readonly [string, StyleBlock])[] = [];

	let i = 0;
	while (i < text.length) {
		const open = text.indexOf("{", i);
		if (open < 0) break;
		const prelude = text.slice(i, open).trim();
		const close = matchBrace(text, open);
		if (close < 0) {
			warn(`unterminated block after "${prelude}"`);
			break;
		}
		const body = text.slice(open + 1, close);
		i = close + 1;

		if (prelude.startsWith("@")) {
			warn(`at-rule "${prelude.split(/\s/)[0]}" is not supported and was skipped`);
			continue;
		}

		for (const raw of splitTop(prelude, ",")) {
			const selector = raw.trim();
			if (selector === "") continue;
			const match = SELECTOR_RX.exec(selector);
			if (!match) {
				warn(`selector "${selector}" is not a single class and was skipped`);
				continue;
			}

			const [, element, className] = match;
			const block: StyleBlock = { className };
			if (element) block.element = element.toLowerCase();

			for (const [property, value] of parseDeclarations(body)) {
				if (applyDeclaration(block, property, value)) continue;
				// Unrecognized declarations are not an error - they simply have no
				// office equivalent, and dropping them would silently degrade the
				// HTML output too. They ride along to CSS and nowhere else.
				block.css = { ...block.css, [property]: value };
			}

			out.push([toPascalCase(className), block] as const);
		}
	}

	return out;
}

/** Index of the `}` matching the `{` at `open`, or -1. */
function matchBrace(text: string, open: number): number {
	let depth = 0;
	let quote: string | undefined;
	for (let i = open; i < text.length; i++) {
		const char = text[i];
		if (quote !== undefined) {
			if (char === "\\") i++;
			else if (char === quote) quote = undefined;
			continue;
		}
		if (char === '"' || char === "'") quote = char;
		else if (char === "{") depth++;
		else if (char === "}" && --depth === 0) return i;
	}
	return -1;
}

// ---- StyleBlock -> CSS ----------------------------------------------------

const CSS_ALIGN: Record<NonNullable<ResolvedStyle["align"]>, string> = {
	l: "left",
	c: "center",
	r: "right",
	j: "justify",
};

/**
 * Declarations for one block, in a fixed order so output is byte-stable for a
 * given registry - which is what makes the round-trip tests assertable.
 */
export function declarationsFor(block: StyleBlock): [string, string][] {
	const out: [string, string][] = [];
	const push = (property: string, value: string | undefined) => {
		if (value !== undefined) out.push([property, value]);
	};

	push("font-family", block.fontFamily);
	push("font-size", block.fontSize);
	if (block.fontWeight !== undefined) push("font-weight", String(block.fontWeight));
	push("font-style", block.fontStyle);
	push("color", block.color);
	push("background-color", block.background);
	if (block.smallCaps !== undefined) {
		push("font-variant", block.smallCaps ? "small-caps" : "normal");
	}
	push("text-transform", block.textTransform);
	push("letter-spacing", block.letterSpacing);
	if (block.underline !== undefined || block.strike !== undefined) {
		const parts: string[] = [];
		if (block.underline) parts.push("underline");
		if (block.strike) parts.push("line-through");
		push("text-decoration", parts.length > 0 ? parts.join(" ") : "none");
	}
	if (block.align !== undefined) push("text-align", CSS_ALIGN[block.align]);
	if (block.lineHeight !== undefined) push("line-height", String(block.lineHeight));
	push("margin-top", block.spaceBefore);
	push("margin-bottom", block.spaceAfter);
	push("margin-left", block.indentLeft);
	push("margin-right", block.indentRight);
	push("text-indent", block.textIndent);
	push("break-before", block.breakBefore);
	if (block.keepWithNext) push("break-after", "avoid");
	else push("break-after", block.breakAfter);
	if (block.keepTogether) push("break-inside", "avoid");
	if (block.widowControl !== undefined) {
		push("widows", block.widowControl ? "2" : "1");
		push("orphans", block.widowControl ? "2" : "1");
	}

	// Clawmark's own properties come last so they read as metadata rather than
	// as formatting, and only when they carry information a default would not.
	if (block.role !== undefined) push(CUSTOM.role, block.role);
	if (block.element !== undefined) push(CUSTOM.element, block.element);
	if (block.family === "text") push(CUSTOM.family, "text");
	if (block.nextStyle !== undefined) push(CUSTOM.next, block.nextStyle);

	for (const [property, value] of Object.entries(block.css ?? {})) out.push([property, value]);
	return out;
}

export interface ToCssOptions {
	/** Prefix on every emitted class, matching the html writer's `classPrefix`. */
	classPrefix?: string;
	/** Indent for declarations. Default one tab. */
	indent?: string;
}

/**
 * Regenerates a stylesheet from a registry.
 *
 * Styles are flattened through `basedOn` first: CSS has no inheritance between
 * class rules, so a derived style has to carry its ancestors' declarations
 * outright or it would render differently in the browser than in Word.
 */
export function toCss(styles: DocumentStyles, options: ToCssOptions = {}): string {
	const prefix = options.classPrefix ?? "";
	const indent = options.indent ?? "\t";
	const rules: string[] = [];

	for (const [name] of styles.entries) {
		const declarations = declarationsFor(styles.resolve(name));
		if (declarations.length === 0) continue;
		const body = declarations
			.map(([property, value]) => `${indent}${property}: ${value};`)
			.join("\n");
		rules.push(`.${prefix}${styles.classFor(name)} {\n${body}\n}`);
	}

	return rules.length === 0 ? "" : rules.join("\n\n") + "\n";
}
