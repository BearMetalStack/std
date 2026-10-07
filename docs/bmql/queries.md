# Queries

A query is a chain of steps. Each takes the set so far and produces the next one, left to right.
Evaluation starts from a set holding just the root (or its elements, if the root is an array).

```
characters{name:Sel}.properties{key:backstory}.value
└── key ──┘└ filter ┘└── key ───┘└── filter ───┘└key┘
```

## Keys

| Syntax        | Meaning                                                                |
| ------------- | ---------------------------------------------------------------------- |
| `characters`  | The key `characters` on each member. The first step needs no dot.      |
| `.properties` | A chained key.                                                         |
| `."odd key"`  | A quoted key, for anything that isn't letters, digits, `_` and `-`.    |
| `.'it\'s'`    | Single quotes work too; `\` escapes inside either, with `\n` and `\t`. |

A key step on a member:

- reads the property, or calls `get(key)` if the member is a `Map`;
- contributes nothing if the member isn't an object, the value is `undefined`, or the value is a
  function — so `characters.toString` is empty rather than a method;
- contributes the **elements** if the value is an array, one level deep.

```ts
const data = { characters: [{ tags: ["quiet", "quick"] }, { tags: [] }, { name: "Orrin" }] };

values(data, "characters.tags"); // ["quiet", "quick"]
values(data, "characters.name"); // ["Orrin"]
values(data, "characters.name.length"); // [] — a string is not an object
```

Objects-as-maps and arrays-of-entries both work, and BMQL doesn't paper over the difference:

```ts
values({ props: { backstory: "…" } }, "props.backstory");
values({ props: [{ key: "backstory", value: "…" }] }, "props{key:backstory}.value");
values({ props: new Map([["backstory", "…"]]) }, "props.backstory");
```

## Filters

`{…}` keeps the members that satisfy every predicate. Predicates are separated by commas.

```ts
values(data, "characters{class:rogue, level:>4}.name"); // ["Sel"]
```

| Predicate       | Holds when                                                                |
| --------------- | ------------------------------------------------------------------------- |
| `name:Sel`      | Equal, loosely (below).                                                   |
| `name:"Sel, V"` | Quoted value. A bare value runs to the next `,` or `}` and is trimmed.    |
| `name:!Sel`     | Nothing at that field equals it (`name:!=Sel` also works).                |
| `lvl:>3`        | `>`, `>=`, `<`, `<=` — numerically, or as strings if both sides are text. |
| `name:~sel`     | Case-insensitive substring.                                               |
| `backstory`     | The field is present and not `null`.                                      |
| `!backstory`    | The field is absent or `null`.                                            |
| `name:$who`     | Equals the variable `who`, or any of its members if it is an array.       |

A field can be a dotted path, and because a path is itself a set, a predicate holds if **any** value
at that path satisfies it:

```ts
values(data, "characters{stats.str:>10}.name");
values(data, "characters{properties.key:motto}.name"); // any property keyed "motto"
```

`!=` is the exception: it holds when **no** value equals, which means a member without the field at
all is kept.

### Loose equality

Values in a query are text, and data isn't, so equality between primitives is loose:

- `level:3` matches `3` and `"3"`; `ok:true` matches `true` and `"true"`; `x:null` matches `null`.
- Numbers compare numerically, so `level:3.0` matches `3`. An empty string never equals `0`.
- Objects and arrays only ever equal themselves (by identity, through a variable).

### Variables

`$name` in a filter reads `options.vars.name`. An array variable matches any of its members, which
is how to express OR:

```ts
values(data, "characters{name:$who}.level", { vars: { who: ["Sel", "Orrin"] } }); // [5, 7]
```

A variable that isn't defined matches nothing (and so `!=` against it holds for everything). A
variable may be a signal; it is read through like any other value.

## Slices

Slices index the **set**, not an array — arrays have already been flattened into it.

| Syntax   | Meaning                                |
| -------- | -------------------------------------- |
| `[0]`    | The first member.                      |
| `[-1]`   | The last member.                       |
| `[1..3]` | Members 1 and 2. The end is exclusive. |
| `[2..]`  | From member 2 on.                      |
| `[..-1]` | All but the last.                      |

An index past either end gives an empty set.

## Relative queries

A query that starts with `$` starts at `options.self` instead of the root. That is how
[templates](./pipes#templates) refer to the item they're rendering, and it works anywhere:

```ts
values(data, "$.name", { self: data.characters[1] }); // ["Vex"]
```

Without a `self`, `$` is the root.

## What a query returns

`values` returns the values. `evaluate` returns **locations**, so a caller can write back through
them:

```ts
interface Location {
	parent?: object; // the container the value was read from
	key?: string | number; // its key or index there
	value: unknown;
	cell?: unknown; // the signal parent[key] actually holds, when one was read through
	up?: Location; // the location of parent itself
}
```

The root's location has no `parent` or `key`. The [store](./store) and `WriteBatch` use `cell` and
`up` to find their way from a match back to the signal above it.

## Errors

A malformed query throws a `BmqlSyntaxError` with the offset it stopped at, and a caret under it:

```
BmqlSyntaxError: Unterminated filter at 1
  a{name:Sel
   ^
```

Malformed _data_ never throws. Parsed queries are memoized by their text, so a query in a loop is
parsed once.
