# @bearmetal/bmql

A small query language for JSON-shaped data, structured or not.

```ts
import { evaluate, values } from "@bearmetal/bmql";

values(data, "characters{name:Sel}.properties{key:backstory}.value");
evaluate(data, "characters{class:rogue}[0]"); // [{ parent, key, value }]
```

## Sets, not single values

Every step yields a **set**, and whoever consumes the result decides how many members it wants.
There is no "find one" versus "find all" in the query itself; slice the set when it matters.

- A key step reads that key on every member of the set.
- A key that lands on an array contributes the array's **elements**, so `characters` is the set of
  characters whether it holds an array or a single object.
- A missing key, or a member that is not an object, contributes **nothing**. Shape mismatches never
  throw.
- `Map`s are read by key, so `properties.backstory` works on a `Map` and on an object alike.

`evaluate` returns locations (`{ parent, key, value }`), so a caller can write back through them.
`values` returns just the values.

## Syntax

| Syntax           | Meaning                                                      |
| ---------------- | ------------------------------------------------------------ |
| `characters`     | key on each member (the first step needs no dot)             |
| `.properties`    | chained key                                                  |
| `."odd key"`     | quoted key (single or double quotes)                         |
| `{name:Sel}`     | keep members matching every predicate                        |
| `[0]` `[-1]`     | one member of the set, from the end when negative            |
| `[1..3]` `[2..]` | a slice of the set, end-exclusive; either end may be omitted |
| `$`              | the current item (`options.self`), for relative queries      |

Predicates inside `{…}` are separated by commas and all must hold. A field may be a dotted path, and
a predicate holds if **any** value at that path satisfies it.

| Predicate       | Holds when                                                           |
| --------------- | -------------------------------------------------------------------- |
| `name:Sel`      | equal, loosely: `3` matches `"3"`, `true` matches `"true"`           |
| `name:"Sel, V"` | quoted value; bare values run to the next `,` or `}` and are trimmed |
| `name:!Sel`     | no value equals (also `!=`); a missing field counts as not equal     |
| `lvl:>3`        | `>`, `>=`, `<`, `<=`, numerically, or as strings if both are text    |
| `name:~sel`     | case-insensitive substring                                           |
| `backstory`     | present and not `null`                                               |
| `!backstory`    | absent or `null`                                                     |
| `name:$who`     | equals `options.vars.who`, or any of its members if it is an array   |

## Pipes and text

`format` turns a query into text, and `>>` stages control how:

```ts
import { format } from "@bearmetal/bmql";

format(data, "characters{class:rogue}.name"); // "Sel, Vex"
format(data, `characters{class:rogue}.name >> " / "`); // "Sel / Vex"
format(data, "characters{class:rogue} >> | $.name | $.class |", { block: true });
// | Sel | rogue |
// | Vex | rogue |
```

- A stage that is exactly one quoted string is a **separator**: the string the items are joined
  with. The default is `", "`, or a newline with `block: true` (a tag on a line of its own).
- Anything else is a **template**, which maps each item to text. Literal text is kept, trimmed at
  both ends; `$` starts a query against the item (`$.name`, `$.tags{x:1}`, or bare `$` for the item
  itself), and a query that finds several values joins them with `", "`. `\` escapes the next
  character (`\>>`, `\$`, `\\`), and `\n`/`\t` are a newline and a tab.
- Stages run left to right. A template after a template sees the previous one's text as `$`.

`null` and `undefined` are left out of the text. An object or array is left out with a warning
(`onWarn`, default `console.warn` once per message), because landing on one usually means the query
stopped a key short. `computeText` is `format` in a `Signal.Computed`, and `hasTemplate` says
whether a pipeline's output is markup rather than a plain value.

## In clawmark documents

`@bearmetal/bmql/clawmark` adds `{{…}}` tags to clawmark:

```ts
import { Signal } from "@bearmetal/app/signals";
import { defaultRules, toHtml } from "@bearmetal/clawmark";
import { bindQueries, bmqlRules } from "@bearmetal/bmql/clawmark";

const rules = [...bmqlRules(data), ...defaultRules()];
const html = new Signal.Computed(() => toHtml(source, rules));
// once the HTML is in the page:
const stop = bindQueries(container, data);
```

```md
Backstory: {{characters{name:Sel}.properties{key:backstory}.value}}

| Name                         | Class  |
| ---------------------------- | ------ |
| {{characters{class:rogue} >> | $.name |
```

- **Value tags** (no template stage) render as `<span data-bmql="query">current text</span>`.
  `bindQueries` gives each one an effect that keeps its text current. The text is read untracked
  while rendering, so a value changing does not re-render the document; only its span updates.
  Writers that don't know the tag unwrap it, so docx and odt get the text. Reading the HTML back
  with `htmlToMarkdown(html, { rules: [bmqlValueRule(data)] })` restores the tag.
- **Template tags** are markup, so a preparse rule expands them before lexing and their output joins
  the text around it: the rows above become rows of the table. A template on a line of its own joins
  with a newline. Expansion does read its signals, so a document rendered inside a `Signal.Computed`
  re-renders when a template's data changes. Expansion is one-way; reading the HTML back gives the
  expanded markup.
- `\{{` is a literal `{{`. Tags inside inline code and fenced blocks are left alone, and a tag that
  does not parse stays as text.

## Signals

Values may be `Signal.State`s or `Signal.Computed`s from `@bearmetal/app/signals`, anywhere in the
data: the root, an array, a key's value, a variable. `evaluate` reads through them by default, so
run inside a `Signal.Computed` or an effect, a query subscribes to exactly the signals it read:

```ts
import { compute, computeValues } from "@bearmetal/bmql";

const backstory = computeValues(data, "characters{name:Sel}.properties{key:backstory}.value");
backstory.get(); // ["Born in the Ashen Reach."]
```

The filter has to read every character's `name`, so renaming any character re-runs the query, but
writing to a property of a character it filtered out does not. `compute` and `computeValues` also
compare results before reporting a change, so a re-run that lands on the same result wakes nothing
downstream.

A location read out of a signal carries it as `cell`, so a caller writing back can `set()` the
signal instead of replacing it.

## Options

- `vars` – values for `$name` operands.
- `self` – what `$` refers to. Default: the root.
- `unwrap` – applied to every value read (the root, each key's value, each array element, each
  variable). Default: `unwrapSignal`. Pass `(v) => v` to treat signals as opaque, or your own to
  read through some other kind of box.
