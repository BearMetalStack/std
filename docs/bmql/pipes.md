# Pipes and text

A query can be followed by `>>` stages that decide how its set becomes text. `format` runs the whole
pipeline and returns a string:

```ts
import { format } from "@bearmetal/bmql";

format(data, "characters{class:rogue}.name"); // "Sel, Vex"
format(data, `characters{class:rogue}.name >> " / "`); // "Sel / Vex"
format(data, "characters{class:rogue} >> | $.name | $.class |", { block: true });
// | Sel | rogue |
// | Vex | rogue |
```

The pipe is `>>` rather than `|` so that `|` stays free for markdown tables.

## Joining

With no stages, each value is written as a string and the results are joined with `", "`, or with a
newline when `block: true` (in clawmark, a tag on a line of its own). A set of many values is never
an error in a text slot; it is a list.

What gets written:

- strings, numbers, booleans and bigints, as `String(value)`;
- not `null` or `undefined` — they are left out, silently;
- not objects or arrays — they are left out **with a warning**, because landing on one usually means
  the query stopped a key short (`characters{name:Sel}.properties{key:backstory}` instead of
  `….value`). The warning goes to `onWarn`, or to `console.warn` once per distinct message, so a
  recomputing template doesn't flood the console.

## Separators

A stage that is exactly one quoted string is a **separator**: the string the final text is joined
with. It overrides either default, and the last one wins.

```ts
format(data, `characters.name >> "\n"`); // "Sel\nVex\nOrrin"
format(data, `characters.name >> ""`); // "SelVexOrrin"
```

Escapes in quoted strings: `\n`, `\t`, and `\` before anything else for that character.

## Templates

Any other stage is a **template**: it maps each item to a string. Literal text is kept, trimmed at
both ends. `$` starts a query against the item — `$.name`, `$.tags{x:1}`, or a bare `$` for the item
itself — and a query that finds several values joins them with `", "`.

```ts
format(data, "characters >> $.name ($.level)"); // "Sel (5), Vex (3), Orrin (7)"
format(data, `characters >> $.name: $.tags >> "; "`); // "Sel: quiet, quick; Vex: ; Orrin: "
format({ names: ["Sel", "Vex"] }, "names >> [$]"); // "[Sel], [Vex]"
```

A template's queries see the same `vars` as the main query.

### Escapes

| In a template | Means                                              |
| ------------- | -------------------------------------------------- |
| `\$`          | A literal `$`.                                     |
| `\>>`         | A literal `>>` (it would otherwise end the stage). |
| `\\`          | A literal `\`.                                     |
| `\n`, `\t`    | A newline, a tab.                                  |

A `>>` inside a query's quoted value doesn't end the stage — `$.x{y:">>"}` is read as a query, not
split. Quote marks in literal text are just text: `>> "$.name" said` is a template, because the
quoted part isn't the whole stage.

### Chaining

Stages run left to right. A template after a template sees the previous one's text as `$`:

```ts
format(data, "characters[0] >> $.name >> <$>"); // "<Sel>"
```

Templates can only refer to the item. There is no way back to the root from inside one; every
interpolation starts at `$`.

## Pipelines as data

`parsePipeline` parses without running, `hasTemplate` says whether a pipeline's output is markup (it
has a template stage) rather than a plain value, and `computeText` is `format` inside a
`Signal.Computed`:

```ts
import { computeText, hasTemplate, parsePipeline } from "@bearmetal/bmql";

hasTemplate("characters.name"); // false
hasTemplate("characters >> - $.name"); // true

const roster = computeText(data, "characters >> - $.name", { block: true });
roster.get(); // "- Sel\n- Vex\n- Orrin", and current whenever it is read
```
