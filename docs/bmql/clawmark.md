# In clawmark documents

::: v-pre

`@bearmetal/bmql/clawmark` adds `{{…}}` tags to [clawmark](../clawmark/): anything between the
braces is a [pipeline](./pipes), run against a root you supply.

```md
# {{characters{name:Sel}.name}}

Backstory: {{characters{name:Sel}.properties{key:backstory}.value}}

| Name                         | Class  |
| ---------------------------- | ------ |
| {{characters{class:rogue} >> | $.name |
```

```ts
import { Signal } from "@bearmetal/app/signals";
import { defaultRules, toHtml } from "@bearmetal/clawmark";
import { bindQueries, bmqlRules } from "@bearmetal/bmql/clawmark";

const rules = [...bmqlRules(data), ...defaultRules()];
const html = new Signal.Computed(() => toHtml(source, rules));

// once the HTML is in the page:
const stop = bindQueries(container, data);
```

Put the BMQL rules **before** `defaultRules()`. `bmqlRules(root, options)` takes the same `vars`,
`unwrap` and `onWarn` options as [`format`](./pipes).

## Two kinds of tag

A tag is one of two things, decided by whether its pipeline has a [template](./pipes#templates)
stage — `hasTemplate`.

### Value tags

A tag without a template is a **value**. It becomes a `bmql:value` node and renders as a span that
holds its current text:

```html
<p>Backstory: <span data-bmql="characters{name:Sel}.properties{key:backstory}.value">Born in the
Ashen Reach.</span></p>
```

- Many values join with `", "`. Text is HTML-escaped; it is never markup.
- **The text is read untracked.** A value changing does not invalidate a `Signal.Computed` the
  document is rendered in, so the document is not rebuilt for it. `bindQueries` updates the span.
- Writers that don't know the tag unwrap it, so **docx and odt get the text**.
- Reading the HTML back restores the tag from the attribute, whatever text the span held by then:

  ```ts
  htmlToMarkdown(html, { rules: [bmqlValueRule(data)] });
  // "Backstory: {{characters{name:Sel}.properties{key:backstory}.value}}"
  ```

### Template tags

A tag with a template is **markup**. A [preparse rule](../clawmark/rules#stages) expands it into the
text it produces _before_ the lexer runs, and the output is lexed together with what's around it.
That is what makes the table above work: the expanded rows are rows of the table whose header
precedes them.

```md
Party: {{characters >> **$.name**}}
```

renders `Party: <strong>Sel</strong>, <strong>Vex</strong>, <strong>Orrin</strong>`.

- A template tag on a line of its own joins its items with a newline; anywhere else, with `", "`. A
  [separator](./pipes#separators) overrides either.
- Expansion **does** read its signals, so a document rendered inside a `Signal.Computed` re-renders
  when a template's data changes. Value tags don't take part in that.
- Expansion is one-way: reading the HTML back gives the expanded markup, not the tag.

## Live spans

```ts
bindQueries(container: ParentNode, root: unknown, options?: BmqlRuleOptions): () => void
```

Finds every `[data-bmql]` element under `container` and gives each one an effect that sets its
`textContent` from `computeText`. Returns one function that stops them all. Elements whose attribute
doesn't parse are skipped.

Effects flush on a microtask, like every effect in `@bearmetal/app`; call `flushEffects()` in a test
to settle them synchronously. Run `bindQueries` in the browser — on a server, the rendered text is
already the snapshot you want.

## Literal braces and code

- `\{{` writes a literal `{{`, in both kinds of tag.
- Tags inside inline code spans and fenced code blocks are left alone, so documentation about BMQL
  can show the syntax. (The check counts fences and backticks, so a span with a multi-backtick
  delimiter can confuse it.)
- A tag that doesn't parse — `{{a{}}`, or no closing braces — stays as literal text.

The end of a tag is found by parsing it, not by searching for `}}`, so a filter right before the
closing braces is fine: `{{characters{name:Sel}}}`.

## The rules individually

`bmqlRules` returns three rules, which can also be used on their own:

| Rule                           | Stage    | Does                                              |
| ------------------------------ | -------- | ------------------------------------------------- |
| `bmqlTemplateRule(root, opts)` | preparse | Expands template tags into markup.                |
| `bmqlEscapeRule()`             | parse    | `\{{` lexes as a literal `{{`.                    |
| `bmqlValueRule(root, opts)`    | parse    | Value tags as `bmql:value` nodes and bound spans. |

`bmqlValueRule` is also the rule to hand the HTML read profile, as above. To query a
[store](./store), pass `store.root` as the root.

:::
