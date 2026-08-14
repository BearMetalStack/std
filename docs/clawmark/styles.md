# Document styles

Every writer can take a set of your own named styles and apply them document-wide. Register them
once — as objects, as CSS, or both — and the same registry drives HTML, docx and odt.

```ts
import { createDocumentStyles, markdownWith } from "@bearmetal/clawmark";
import { htmlWriter } from "@bearmetal/clawmark/profiles/html";
import { docxWriter } from "@bearmetal/clawmark/profiles/docx";
import { odtWriter } from "@bearmetal/clawmark/profiles/odt";

const styles = createDocumentStyles()
	.define("Scene Break", {
		align: "c",
		spaceBefore: "1.5em",
		fontStyle: "italic",
		letterSpacing: "0.3em",
		keepWithNext: true,
	})
	.bind("graver:scenebreak", "Scene Break");

markdownWith(src, htmlWriter({ styles })); // <p class="scene-break">
markdownWith(src, docxWriter({ styles })); // <w:pStyle w:val="SceneBreak"/>
markdownWith(src, odtWriter({ styles })); //  <text:p text:style-name="SceneBreak">
```

The point is the last three lines. A custom rule declares how it should look **once**, and needs no
emitter of its own in any format.

## Why this is not `ResolvedStyle`

[`ResolvedStyle`](./write) is deliberately tiny — `bold`, `italic`, `align`, `breakBefore`. It is
what _rules match on_, and `whereStyle(s => s.bold)` only stays ergonomic while the property list is
short enough to autocomplete. Typography does not belong in it.

So rich formatting lives in a separate registry keyed by style **name**, and `ResolvedStyle.named`
(or `charStyle`, for inline styles) is the link between the two:

```
StyleBlock  ──name──▶  ResolvedStyle.named  ──▶  the writers
(typography)           (what rules match on)
```

This is not a new mechanism so much as a use of one that was already there: the docx and odt readers
have always recovered a style name from `w:pStyle` / `text:style-name`, and the odt writer has
always preferred `named` over its own role mapping.

## Two ways to author

Both land on the same registry, and CSS layered over an object definition **merges** — so structural
facts can live in TypeScript while a per-novel stylesheet overrides appearance.

```ts
const styles = createDocumentStyles({ baseFontSize: "12pt" })
	.define("Chapter Title", { role: "heading", headingLevel: 1 })
	.fromCss(`
		.chapter-title {
			break-before: page;
			font-size: 24pt;
			font-family: "EB Garamond", serif;
			text-align: center;
		}
		.verse   { margin-left: 2em; text-indent: -1em; font-style: italic; }
		.thought { font-style: italic; --clawmark-family: text; }
	`);
```

A class becomes a style name by PascalCase (`.scene-break` → `SceneBreak`), and the original class
is kept so `classFor()` hands back exactly what you wrote.

### The CSS subset

Single class selectors only, optionally qualified by a tag (`blockquote.verse`, which also sets
`element`). Descendant selectors, pseudo-classes and at-rules are **skipped with a warning** rather
than half-honored — they have no meaning in a format with no cascade.

Declarations clawmark does not understand are not an error. They ride along in `StyleBlock.css` and
reach the CSS output, and nowhere else.

Five properties have no CSS equivalent, so they are spelled as custom properties — still valid CSS
that a browser ignores:

| Custom property       | Meaning                                         |
| --------------------- | ----------------------------------------------- |
| `--clawmark-role`     | `heading`, `quote`, `code`, `list`, `table`     |
| `--clawmark-element`  | HTML element this style renders as              |
| `--clawmark-family`   | `text` for an inline (character) style          |
| `--clawmark-next`     | style applied to the following paragraph        |
| `--clawmark-based-on` | inherit every unset property from another style |

## Binding a style to a node

```ts
styles.bind("graver:scenebreak", "Scene Break");
```

A node can override its tag's binding with a `style` key in its own `data`, which is what a rule
should emit when the style is chosen per-instance rather than per-construct:

```ts
{ tag: "graver:scenebreak", data: { style: "Emphatic Break" }, children: [] }
```

::: warning A custom **block** rule must also call `addBlockTags()`. Without it the lexer's
automatic paragraph wrapper stays put and the construct is emitted inside a paragraph — a `<p>` in
HTML, an invalid `<text:p>` in odt that readers silently discard. See [Rules](./rules). :::

## What each writer does with it

|                | HTML                         | docx                             | odt                                     |
| -------------- | ---------------------------- | -------------------------------- | --------------------------------------- |
| Definition     | a rule in the generated CSS  | `<w:style>` in `word/styles.xml` | `<style:style>` in `styles.xml`         |
| Reference      | `class="scene-break"`        | `<w:pStyle w:val="SceneBreak"/>` | `text:style-name="SceneBreak"`          |
| Inline style   | `<span class="thought">`     | `<w:rStyle w:val="Thought"/>`    | `<text:span text:style-name="Thought">` |
| Bound to `md:` | decorates the element it has | replaces the paragraph style     | replaces the paragraph style            |

That last row is the one asymmetry, and it is deliberate. CSS decorates elements, so a blockquote
bound to `Verse` stays a `<blockquote>` and gains `class="verse"`. docx and odt have only the style
name to say anything with, so there the name is the whole answer.

A registered style whose id collides with a built-in (`Quote`, `Heading1`, `SourceCode`)
**replaces** it, in every format. Restyling the defaults for one novel does not mean forking a
writer.

## Units

Absolute units (`pt in cm mm px pc`) convert exactly. `em`, `rem` and `%` resolve against
`baseFontSize` (default `12pt`) for docx and odt, which have no relative lengths at all — **HTML
keeps them as written**, which is most of the reason CSS is a supported input.

| Written | CSS     | docx                               | odt    |
| ------- | ------- | ---------------------------------- | ------ |
| `24pt`  | `24pt`  | `<w:sz w:val="48"/>` (half-points) | `24pt` |
| `1.5em` | `1.5em` | `360` twips                        | `18pt` |
| `1cm`   | `1cm`   | `567` twips                        | `1cm`  |
| `1.5`   | `1.5`   | `w:line="360" w:lineRule="auto"`   | `150%` |

A negative `textIndent` becomes a hanging indent, which is how both office formats spell it.

## Getting the CSS out

`toCss()` is public, and is the entry point for a web component:

```ts
import { toCss } from "@bearmetal/clawmark";

const sheet = new CSSStyleSheet();
sheet.replaceSync(toCss(styles));
shadowRoot.adoptedStyleSheets = [sheet];
```

`basedOn` is flattened on the way out, because CSS classes do not inherit from each other — a
derived style has to carry its ancestors' declarations outright or it would render differently in
the browser than in Word.

`htmlWriter` can also place the sheet for you: `stylesheet: "part"` (the default) puts it in
`parts["styles.css"]`, `"inline"` puts it in a `<style>` element, `"none"` leaves it to you.

## Round-trip caveat

Character properties on a **paragraph** style cascade to the runs inside it, and a reader cannot
tell "italic because it is a Scene Break" from "italic because the author said so". A `.docx`
written with an italic `SceneBreak` therefore reads back as `*text*`.

This is the same reason the built-in heading styles carry a size but deliberately no `<w:b/>`.

Reading your own output back needs nothing special — the styles part is self-describing, so the
ordinary call already resolves every name you registered:

```ts
docxProfile({ styles: parts["word/styles.xml"] });
```

`styles.table()` is for the other direction: reading a document clawmark did **not** write, where
you want your registry's normalized roles applied to whatever style names it happens to use.
`Profile` takes a `styleTable`, so hand it over on the way past:

```ts
const profile = { ...docxProfile(parts), styleTable: styles.table() };
```

If the cascade still gets in the way, narrow `StyleResolver.inherits` — see `DEFAULT_INHERITS` in
`style.ts` for what it covers and why block-level properties are already excluded.
