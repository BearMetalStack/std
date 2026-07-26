# Profile DSL

A small declarative builder for reverse rules, so a profile reads as data rather than as a pile of
matcher closures.

```ts
import { on, onAny, onStyle, scopedOn } from "@bearmetal/clawmark/dsl";
```

Everything here is also re-exported from the package root.

```ts
on("h1").emit("md:heading", { level: 1 });
on("w:p").whereStyle((s) => s.blockRole === "heading").wrap("md:heading");
onStyle((s) => s.bold).wrap("md:bold");
on(["w:sectPr", "w:proofErr"]).drop();
```

Each expression produces an `AnyReverseRule` with a generated id in the `rev:` namespace. Because no
node ever carries a `rev:` tag, the forward dispatch maps are never consulted for these rules —
which is what lets you write a matcher without also writing
`validate`/`tokenize`/`tree`/`renderOpen` stubs for a construct that has no markdown syntax of its
own.

The `serialize` hooks for the tags they emit come from the matching forward rule in
`defaultRules()`, which is why a profile's `rules` array almost always ends with
`...defaultRules()`.

## Selecting elements

### on(tag, nsMap?)

Starts a rule for one or more element names. An array shares one rule across several names.

```ts
on("blockquote").wrap("md:blockquote");
on(["b1", "b2"]).wrap("md:bold");
```

A **prefixed** name is split. The registry buckets on the local name, and the prefix becomes a
resolved-URI predicate when `nsMap` supplies a binding:

```ts
const rules = [on("w:p", { w: "urn:w" }).wrap("md:heading", { level: 1 })];

// bound to the right URI: matches
xmlToMarkdown(`<doc xmlns:w="urn:w"><w:p>hi</w:p></doc>`, profile); // "# hi"

// bound to a different URI: declines, and the default unwrap keeps the text
xmlToMarkdown(`<doc xmlns:w="urn:other"><w:p>hi</w:p></doc>`, profile); // "hi"
```

Buckets key on the local name because prefixes are not stable across producers — a document is free
to bind `w14:` or rebind `w:` — while matching still checks the URI, which is.

**An element with no resolved namespace is accepted.** docx and odt fragments are routinely handed
over without their root declarations, and refusing those would make the profiles useless on real
input:

```ts
xmlToMarkdown("<doc><w:p>hi</w:p></doc>", profile); // "# hi"
```

### onAny()

Starts a rule consulted for every element, whatever its name. This is the wildcard bucket.

### onStyle(pred)

Sugar for `onAny().whereStyle(pred)`. The docx profile leans on this heavily, since there every
block is a `<w:p>` and the real distinction lives in the resolved style.

### scopedOn(nsMap)

Binds `on` to a namespace map so a profile can write `on("w:p")` throughout without repeating it:

```ts
const w = scopedOn({ w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main" });

w("w:p").wrap("core:paragraph");
w("w:r").whereStyle((s) => !!s.bold).wrap("md:bold");
```

## Predicates

Every `where*` method appends a predicate; predicates are **ANDed**.

| Builder method              | Free function            | Matches when                                                   |
| --------------------------- | ------------------------ | -------------------------------------------------------------- |
| `.where(...preds)`          | —                        | All of the given matchers pass.                                |
| `.whereStyle(pred)`         | `whereStyle(pred)`       | The resolved style satisfies `pred`.                           |
| `.whereAttr(name, value?)`  | `attr(name, value?)`     | The attribute exists, or equals a string / matches a `RegExp`. |
| `.whereNs(uri)`             | `ns(uri)`                | The element's namespace URI is `uri`.                          |
| `.whereAncestor(localName)` | `hasAncestor(localName)` | Some ancestor has that local name.                             |
| `.whereChild(localName)`    | `hasChild(localName)`    | A direct child has that local name.                            |
| `.whereNot(...preds)`       | `not(matcher)`           | The ANDed predicates do **not** all pass.                      |
| —                           | `style(nameOrPattern)`   | The named style equals a string or matches a `RegExp`.         |
| —                           | `hasClass(name)`         | The HTML `class` attribute contains `name`.                    |
| —                           | `inside(tag)`            | The enclosing _emitted_ node has that clawmark tag.            |
| —                           | `textMatches(pattern)`   | The flattened subtree text matches.                            |
| —                           | `all(...)` / `any(...)`  | Combinators.                                                   |

The free functions are matchers of type `(el, ctx) => boolean`; pass them to `.where()` or compose
them with `all` / `any` / `not`.

```ts
import { all, hasClass, on, textMatches } from "@bearmetal/clawmark";

on("p").where(hasClass("q")).wrap("md:blockquote");
// <p class="q">a</p><p>b</p>  ->  "> a\n\nb"

on("p").where(textMatches(/^!/)).drop();
// <p>!hidden</p><p>shown</p>  ->  "shown"

on("p").whereNot(hasClass("skip")).wrap("core:paragraph");
// <p>a</p><p class="skip">b</p>  ->  "a"

on("div").where(all(hasClass("card"), textMatches(/\S/))).wrap("md:blockquote");
```

### named(id)

Overrides the generated `rev:` id, which makes debugging output readable:

```ts
on("x").drop().id; // e.g. "rev:x-7" — generated, counter-suffixed
on("x").named("rev:custom").drop().id; // "rev:custom"
```

## Terminals

The terminal call ends the chain and produces the rule. Each maps to a
[`MatchResult` kind](./reverse#match-results).

| Terminal            | Result   | Effect                                             |
| ------------------- | -------- | -------------------------------------------------- |
| `.wrap(tag, data?)` | `wrap`   | Emit a node, crawl the element's children into it. |
| `.emit(tag, data?)` | `leaf`   | Emit a childless node; the subtree is consumed.    |
| `.nodes(build)`     | `nodes`  | Emit several ready-built siblings.                 |
| `.unwrap()`         | `unwrap` | Drop the element, keep its children.               |
| `.drop()`           | `drop`   | Drop the element and its subtree.                  |
| `.raw()`            | `raw`    | Emit the element verbatim.                         |
| `.to(fn)`           | any      | Full control; return `null` to decline.            |

`data` on `wrap` and `emit` is either a literal object or a function
`(el, ctx) => Record<string, unknown>`:

```ts
on("t").wrap("md:heading", { level: 2 });

on("ref").emit("md:footnote", (el) => ({ id: el.attrs.get("id") ?? "" }));
// <ref id="7">ignored</ref>  ->  "[^7]"

on("w:p").whereStyle((s) => s.blockRole === "heading")
	.wrap("md:heading", (_el, ctx) => ({ level: ctx.style.headingLevel ?? 1, phase: "open" }));
```

`.to()` is the escape hatch for anything the fixed terminals can't express — a result that depends
on the element, or a rule that needs to decline conditionally:

```ts
on("a").to((el, ctx) => {
	const href = ctx.attr("href", el);
	if (!href) return null; // an anchor, not a link: let the next rule try
	return { kind: "leaf", tag: "md:link", data: { href, text: ctx.text(el) } };
});
```

## Precedence

**Array order is precedence, and the first matching rule wins.** Exactly as in the forward lexer.

```ts
[on("x").wrap("md:bold"), on("x").wrap("md:italic")]; // <x>a</x> -> "**a**"
[on("x").wrap("md:italic"), on("x").wrap("md:bold")]; // <x>a</x> -> "*a*"
```

This holds across the tag-name and wildcard buckets too — they are merge-sorted by source index at
dispatch, so a wildcard rule written earlier beats a named rule written later:

```ts
[onStyle(() => false).drop(), on("*").unwrap()];
// <anything>a</anything>  ->  "a"
```

Practically, this means **order from most specific to least**:

```ts
w("w:r").whereStyle((s) => !!s.bold && !!s.italic).wrap("md:bolditalic"),
w("w:r").whereStyle((s) => !!s.bold).wrap("md:bold"),
w("w:r").whereStyle((s) => !!s.italic).wrap("md:italic"),
w("w:r").unwrap(),  // the catch-all, last
```

Get that backwards and the bold-and-italic run is claimed by the bold-only rule, and the italic is
lost.

## A complete profile

Turning a hypothetical CMS feed format into markdown:

```ts
import { defaultRules, on, xmlToMarkdown } from "@bearmetal/clawmark";
import type { AnyReverseRule, Profile } from "@bearmetal/clawmark";

const feedRules: AnyReverseRule[] = [
	on("entry").wrap("core:paragraph"),
	on("title").wrap("md:heading", { level: 2 }),
	on("body").unwrap(),
	on("em").wrap("md:italic"),
	on("meta").drop(),
	on("link").to((el, ctx) => ({
		kind: "leaf",
		tag: "md:link",
		data: { href: ctx.attr("href", el) ?? "#", text: ctx.text(el) },
	})),
];

export const feedProfile: Profile = {
	name: "feed",
	rules: [...feedRules, ...defaultRules()],
	unmatched: "unwrap",
};
```

```ts
const src = `<feed>
  <entry>
    <title>Release notes</title>
    <meta author="emma"/>
    <body>Shipped <em>today</em>. <link href="/changelog">Changelog</link></body>
  </entry>
</feed>`;

xmlToMarkdown(src, feedProfile);
// "## Release notes\n\nShipped *today*. [Changelog](/changelog)\n"
```

Note what `...defaultRules()` is doing at the end: nothing in `feedRules` says how to _write_ an
`md:heading` or an `md:link` back out. Those `serialize` hooks come from the default rules, and
dropping them would leave the serializer falling through to bare children.

## Extending a built-in profile

Every shipped profile takes a `rules` option whose contents are consulted **before** the built-ins,
so you can override any of them without forking the profile:

```ts
import { docxProfile } from "@bearmetal/clawmark/profiles/docx";
import { on } from "@bearmetal/clawmark";

const profile = docxProfile({
	styles,
	numbering,
	rules: [
		// company template: "Callout" paragraphs become blockquotes
		on("w:p").whereStyle((s) => s.named === "Callout").wrap("md:blockquote", { phase: "open" }),
	],
});
```
