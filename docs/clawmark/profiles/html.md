# The HTML profile

```ts
import { htmlProfile } from "@bearmetal/clawmark/profiles/html";
```

Unlike docx and odt, this profile is not a separate body of knowledge. HTML is clawmark's _own_
output format, so the matchers live on the rules themselves in `rules/*.ts`, and `fromHtml` is the
true inverse of `toHtml`. What the module adds on top is the style resolver — which exists mainly to
survive pasted-from-Word HTML — and the structural elements markdown has no equivalent for.

It is the default, so most callers never name it:

```ts
import { fromHtml, htmlToMarkdown } from "@bearmetal/clawmark";

htmlToMarkdown("<h1>Hello</h1>"); // "# Hello\n"
fromHtml("<h1>Hello</h1>"); // the Node tree
```

## Input

`htmlToMarkdown` and `fromHtml` accept four things:

```ts
htmlToMarkdown(htmlText); // string, parsed in html mode
htmlToMarkdown(alreadyParsedElement); // XmlElement
htmlToMarkdown(document.body); // live Element
htmlToMarkdown(fragment); // live DocumentFragment or Document
```

Live DOM is adapted through `fromDom`, which walks it into the same structural `XmlElement` shape —
no `DOMParser`, no serialize-and-reparse round trip.

Parsing uses HTML mode: names fold to lowercase, void and raw-text elements are honored, the
implicit-close table applies (`<li>` closes `<li>`), unquoted attributes and stray `<` are
tolerated, and namespace resolution is skipped. See [the XML parser](../xml).

## What it handles

Every construct in [the default rule set](../#supported-markdown) reverses, because each rule
carries its own matcher:

````ts
htmlToMarkdown("<h1>One</h1>"); // "# One\n"
htmlToMarkdown("<p><b>a</b> <i>b</i></p>"); // "**a** *b*\n"
htmlToMarkdown("<p><strong><em>d</em></strong></p>"); // "***d***\n"
htmlToMarkdown("<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>"); // "- a\n  - b\n- c\n"
htmlToMarkdown("<pre><code>a\n  indented\n</code></pre>"); // "```\na\n  indented\n```\n"
htmlToMarkdown("<p>a &amp; b &mdash; c</p>"); // "a & b — c\n"
````

A few matchers are context-sensitive rather than purely tag-driven:

| HTML                          | Becomes             | Because                                                   |
| ----------------------------- | ------------------- | --------------------------------------------------------- |
| `<p>` inside `<blockquote>`   | `md:lineitem`       | A blockquote's lines aren't paragraphs.                   |
| `<li><p>x</p></li>`           | item content        | A blank line inside an item re-lexes as "the list ended". |
| `<li><input type="checkbox">` | `md:checkitem`      | Checklist items.                                          |
| `<ul class="none">`           | checklist container | What the forward renderer emits for one.                  |
| `<a name="x">` (no `href`)    | declined            | An anchor, not a link.                                    |
| `<a href="#fnref-1">`         | dropped             | The footnote backlink; `md:footnotedef` owns it.          |
| `<strong><em>x</em></strong>` | one `md:bolditalic` | Post-processing folds it, so it writes `***x***`.         |

Text that would be re-lexed as markup is escaped on the way out, and the escape is real rather than
cosmetic:

```ts
toHtml(htmlToMarkdown("<p>2 * 3 * 4</p>")); // "<p>2 * 3 * 4</p>"
toHtml(htmlToMarkdown("<p># not a heading</p>")); // "<p># not a heading</p>"
```

## Structural elements

Two lists cover the elements markdown has no concept of.

**Transparent** — no markdown meaning, but their children have. Unwrapped: dropping them outright
would lose content, keeping them would produce raw HTML for what is really just layout.

`html`, `body`, `main`, `article`, `section`, `div`, `span`, `header`, `footer`, `nav`, `figure`,
`figcaption`, `tbody`, `thead`, `tfoot`, `colgroup`, `font`, `small`, `big`, `u`, `ins`, `abbr`,
`cite`, `q`, `time`, `label`

**Dropped** — the whole subtree is noise in a markdown context.

`head`, `script`, `style`, `meta`, `link`, `title`, `base`, `col`, `noscript`

```ts
htmlToMarkdown("<div><section><p>hi</p></section></div>"); // "hi\n"
htmlToMarkdown("<head><title>t</title></head><body><p>hi</p></body>"); // "hi\n"
```

## Options

```ts
interface HtmlProfileOptions {
	rules?: AnyReverseRule[]; // extra rules, consulted *before* the built-ins
	unmatched?: UnmatchedPolicy | UnmatchedHandler; // default "unwrap"
	unmatchedByTag?: Record<string, UnmatchedPolicy | UnmatchedHandler>;
	classMap?: Record<string, ResolvedStyle>; // extra class -> style mappings
}
```

`htmlToMarkdown` takes these **and** every [`SerializeOptions`](../#output-options) field in one
bag:

```ts
htmlToMarkdown(html, {
	unmatchedByTag: { video: "raw" },
	bullet: "*",
	listIndent: 4,
});
```

### Rule order

The profile's rule array is, in order:

1. `options.rules`
2. `defaultRules()`
3. the dropped-element rules
4. the transparent-element rules

Order is precedence, so `<span class="highlight">` is claimed by `highlightRule` before the blanket
`span` unwrap ever sees it — and anything you pass in `options.rules` outranks all of it.

### Unmatched policies

```ts
htmlToMarkdown("<p>a <custom>b</custom> c</p>");
// "a b c\n"  — default unwrap

htmlToMarkdown("<p>a</p><video src='v.mp4'></video>", {
	unmatchedByTag: { video: "raw" },
});
// 'a\n\n<video src="v.mp4"></video>\n'

htmlToMarkdown("<p>a</p><x-thing>b</x-thing>", {
	unmatched: (el) => el.name.startsWith("x-") ? { kind: "drop" } : null,
});
// "a\n"
```

Full details in [the reverse pipeline](../reverse#unmatched-elements).

## Pasted-from-Word HTML

Word's HTML export writes list structure into CSS rather than into `<ul>`/`<li>`, and tags nearly
everything with an `Mso*` class. Without help, an exported document degrades into an
undifferentiated run of paragraphs.

`htmlStyleResolver` recovers what it can into a [`ResolvedStyle`](../reverse#resolvedstyle):

| Source                                                      | Recovered                                    |
| ----------------------------------------------------------- | -------------------------------------------- |
| `class="MsoHeading1"` … `MsoHeading6`                       | `blockRole: "heading"`, `headingLevel`       |
| `class="MsoTitle"`                                          | `blockRole: "heading"`, level 1              |
| `class="MsoQuote"` / `MsoIntenseQuote`                      | `blockRole: "quote"`                         |
| `class="MsoListParagraph"` (+ `CxSpFirst`/`Middle`/`Last`)  | `blockRole: "list"`                          |
| `class="MsoNormal"`                                         | `blockRole: "paragraph"`                     |
| `style="font-weight: bold"` (or `600`–`900`)                | `bold`                                       |
| `style="font-style: italic\|oblique"`                       | `italic`                                     |
| `style="text-decoration: line-through"`                     | `strike`                                     |
| `style="font-family: …mono/courier/consolas/menlo/monaco…"` | `mono`                                       |
| `style="background-color: …"` (non-white)                   | `highlight`                                  |
| `style="text-align: left\|center\|right"`                   | `align`                                      |
| `style="mso-list: … level2 …"`                              | `list: { kind, level }`, `blockRole: "list"` |

::: warning

**The resolver reports style; it does not act on it.** None of the default rules consult `ctx.style`
— they match on tag names, because in ordinary HTML the tags carry the meaning. So a resolved
`blockRole: "heading"` changes nothing on its own:

```ts
htmlToMarkdown(`<p class="MsoHeading1">Chapter One</p>`);
// "Chapter One\n"  — still a paragraph
```

To act on the recovered style, add rules that match on it.

:::

```ts
import { htmlToMarkdown, on, onStyle } from "@bearmetal/clawmark";
import type { AnyReverseRule } from "@bearmetal/clawmark";

const wordRules: AnyReverseRule[] = [
	onStyle((s) => s.blockRole === "heading").wrap("md:heading", (_el, ctx) => ({
		level: ctx.style.headingLevel ?? 1,
		phase: "open",
	})),
	onStyle((s) => s.blockRole === "quote").wrap("md:blockquote", { phase: "open" }),
	on("span").whereStyle((s) => !!s.bold).wrap("md:bold"),
	on("span").whereStyle((s) => !!s.italic).wrap("md:italic"),
];

const html = `<p class=MsoHeading1>Chapter One</p>` +
	`<p class=MsoQuote>A quoted line.</p>` +
	`<p>Plain <span style="font-weight:bold">bold</span> text.</p>`;

htmlToMarkdown(html, { rules: wordRules });
// "# Chapter One\n\n> A quoted line.\n\nPlain **bold** text.\n"
```

Note the unquoted `class=MsoHeading1` — the HTML-mode parser tolerates it, which real Word output
requires.

### classMap

Extend the class table for your own conventions. Entries merge over the built-in `Mso*` set:

```ts
htmlToMarkdown(html, {
	classMap: {
		lede: { blockRole: "heading", headingLevel: 2 },
		"callout-warning": { blockRole: "quote" },
	},
	rules: wordRules, // still needed to act on the roles
});
```

### parseInlineStyle

The inline-CSS parser is exported on its own, for building a resolver of your own:

```ts
import { parseInlineStyle } from "@bearmetal/clawmark/profiles/html";

parseInlineStyle("font-weight: bold; color: red");
// Map { "font-weight" => "bold", "color" => "red" }
```

Property names are lowercased and trimmed; values are trimmed but otherwise untouched.
