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

## Options

- `vars` – values for `$name` operands.
- `self` – what `$` refers to. Default: the root.
- `unwrap` – applied to every value read (the root, each key's value, each array element, each
  variable). This is the hook for reading through signals or other boxes.
