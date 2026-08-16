/**
 * @module
 * The lookup tables that make up the entire difference between the parser's
 * "xml" and "html" modes. Keeping them here rather than inline in parser.ts is
 * what lets one tokenizer serve both grammars: the HTML quirks are purely
 * additive data, not a different parse strategy.
 */

/** Never have children and never need a closing tag. */
export const VOID: Set<string> = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
]);

/**
 * Attributes whose presence is the whole value.
 *
 * XML has no such thing - `disabled=""` is the only legal spelling - so the
 * builder stores `true` as an empty string and the serializer writes it back
 * out that way. In HTML that is *equivalent* but not *identical*, and identical
 * is what the html write profile needs: its output is compared against the
 * `renderOpen` path, which writes the bare form.
 */
export const BOOLEAN_ATTRS: Set<string> = new Set([
	"allowfullscreen",
	"async",
	"autofocus",
	"autoplay",
	"checked",
	"controls",
	"default",
	"defer",
	"disabled",
	"formnovalidate",
	"inert",
	"ismap",
	"itemscope",
	"loop",
	"multiple",
	"muted",
	"nomodule",
	"novalidate",
	"open",
	"playsinline",
	"readonly",
	"required",
	"reversed",
	"selected",
]);

/** Content is scanned verbatim to the matching close tag and never decoded. */
export const RAW_TEXT: Set<string> = new Set(["script", "style"]);

/** Content is scanned verbatim to the matching close tag, but entity-decoded. */
export const ESCAPABLE_RAW: Set<string> = new Set(["textarea", "title"]);

/**
 * Opening one of the value-set elements implicitly closes an open key element
 * sitting on top of the stack. Checking only the *top* of the stack (rather
 * than "nearest in scope") is what keeps a nested `<ul>` from letting an inner
 * `<li>` close the outer item - the `<ul>` sits between them.
 */
export const AUTO_CLOSE: Record<string, Set<string>> = {
	p: new Set([
		"address",
		"article",
		"aside",
		"blockquote",
		"details",
		"div",
		"dl",
		"fieldset",
		"figcaption",
		"figure",
		"footer",
		"form",
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"h6",
		"header",
		"hgroup",
		"hr",
		"main",
		"menu",
		"nav",
		"ol",
		"p",
		"pre",
		"section",
		"table",
		"ul",
	]),
	li: new Set(["li"]),
	dt: new Set(["dt", "dd"]),
	dd: new Set(["dt", "dd"]),
	td: new Set(["td", "th", "tr"]),
	th: new Set(["td", "th", "tr"]),
	tr: new Set(["tr"]),
	thead: new Set(["tbody", "tfoot"]),
	tbody: new Set(["tbody", "tfoot"]),
	option: new Set(["option", "optgroup"]),
	optgroup: new Set(["optgroup"]),
};

/** Elements that imply `white-space: pre` for the crawler's normalizer. */
export const PRE_ELEMENTS: Set<string> = new Set(["pre", "textarea", "listing", "plaintext"]);
