# @bearmetal/bmql

A small query language for JSON-shaped data — structured or not, plain or full of signals.

```ts
import { values } from "@bearmetal/bmql";

values(data, "characters{name:Sel}.properties{key:backstory}.value");
// ["Born in the Ashen Reach."]
```

It reads like a path with filters in it. It never throws on the shape of your data, it reads through
TC39 signals wherever it finds them, and it ships with everything needed to put live query results
in a [clawmark](../clawmark/) document:

```md
Backstory: {{characters{name:Sel}.properties{key:backstory}.value}}
```

## Sets, not single values

Every query produces a **set**. There is no "find one" versus "find all" in the language — each step
takes the set so far and produces the next one, and whoever consumes the result decides how many
members it wants.

```ts
values(data, "characters{class:rogue}.name"); // ["Sel", "Vex"]
values(data, "characters{class:rogue}[0].name"); // ["Sel"]
format(data, "characters{class:rogue}.name"); // "Sel, Vex"
```

Three rules fall out of that, and they are what make unstructured data workable without a schema:

- **A key on a set reads that key on every member.** `characters.name` is every character's name.
- **Arrays flatten into the set.** A key that lands on an array contributes the array's elements, so
  `characters` is the set of characters whether it holds an array or a single object, and a filter
  always tests members rather than the array around them.
- **Missing is empty.** A key a member doesn't have, or a member that isn't an object, contributes
  nothing. A query against data of the wrong shape returns `[]`; it does not throw.

When you need fewer than all of them, say so with a slice — `[0]`, `[-1]`, `[1..3]` — or let the
consumer decide: a text slot joins them, a store write hits each one.

## Quick start

```ts
import { compute, evaluate, format, values } from "@bearmetal/bmql";

const data = {
	characters: [
		{ name: "Sel", class: "rogue", level: 5 },
		{ name: "Vex", class: "rogue", level: 3 },
		{ name: "Orrin", class: "cleric", level: 7 },
	],
};

values(data, "characters{level:>4}.name"); // ["Sel", "Orrin"]
values(data, "characters[-1].class"); // ["cleric"]
format(data, "characters >> $.name ($.level)"); // "Sel (5), Vex (3), Orrin (7)"

const [where] = evaluate(data, "characters{name:Sel}.level");
where; // { parent: data.characters[0], key: "level", value: 5, up: … }
```

Put signals in the data and wrap the query in `compute` to keep the result live:

```ts
import { Signal } from "@bearmetal/app/signals";
import { computeValues } from "@bearmetal/bmql";

const level = new Signal.State(5);
const sel = computeValues({ characters: [{ name: "Sel", level }] }, "characters.level");
sel.get(); // [5]
level.set(6);
sel.get(); // [6]
```

## Where to go next

| Page                      | Covers                                                                          |
| ------------------------- | ------------------------------------------------------------------------------- |
| [Queries](./queries)      | Paths, filters, slices, variables, and what a query returns.                    |
| [Pipes and text](./pipes) | `>>` stages: separators, per-item templates, turning a set into text.           |
| [Signals](./signals)      | Reading through signals, `compute`, and exactly what gets tracked.              |
| [In clawmark](./clawmark) | <code v-pre>{{…}}</code> tags in documents, live spans, and template expansion. |
| [Store](./store)          | A reactive table store you query and write with BMQL.                           |
| [API reference](./api)    | Every export.                                                                   |

## Export map

| Specifier                  | Contents                                                            |
| -------------------------- | ------------------------------------------------------------------- |
| `@bearmetal/bmql`          | Parsing, `evaluate`/`values`, `format`, `compute*`, `unwrapSignal`. |
| `@bearmetal/bmql/types`    | Types only.                                                         |
| `@bearmetal/bmql/clawmark` | `bmqlRules` and the individual rules, `bindQueries`.                |
| `@bearmetal/bmql/store`    | `Store`, `Table`, `WriteBatch`.                                     |

The core depends on `@bearmetal/app/signals` (it has to share the polyfill instance with your data
to recognize its signals). The clawmark integration additionally depends on `@bearmetal/clawmark`,
and the store on `@bearmetal/forge`.
