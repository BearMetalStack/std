# Store

`@bearmetal/bmql/store` is a table store you query and write with BMQL. Each table's rows live in a
signal under one reactive root, so anything querying that root stays current as you write.

```ts
import { Store } from "@bearmetal/bmql/store";
import { computeValues } from "@bearmetal/bmql";
import { f } from "@bearmetal/forge";

const store = new Store();
const characters = store.table("characters", f.object({ name: f.string(), level: f.number() }));
characters.insert({ name: "Sel", level: 5 }, { name: "Vex", level: 3 });

const high = computeValues(store.root, "characters{level:>4}.name");
high.get(); // ["Sel"]

store.merge("characters{name:Vex}", { level: 6 });
high.get(); // ["Sel", "Vex"]
```

## Tables

```ts
store.table<T>(name, schema?): Table<T>
```

Returns the table called `name`, creating it on first use. A schema can only be given when the table
is created; giving one for a table that already exists throws. Tables without a schema take any
shape of row.

`store.root` is `{ [table]: rows }` as signals — pass it to `compute`, `computeText`, or
[`bmqlRules`](./clawmark). A table created later is picked up by queries already running against the
root. `store.tables` lists the names.

`table.insert(...rows)` appends rows, parsing each through the schema if there is one, and returns
them as stored (a schema may coerce or default fields). A row that fails throws a `SchemaError` and
nothing is inserted.

## Querying

The store's methods start at the root and name the table first. A table's own methods start at its
rows:

```ts
store.values("characters{level:>4}.name");
characters.values("{level:>4}.name"); // the same
```

Both have `query` (locations) and `values`. For anything live, use `compute*` against `store.root`
or `table.rows`.

## Writing

```ts
store.update("characters{name:Sel}.level", 6);
store.update("characters.level", (level) => (level as number) + 1);
store.merge("characters{name:Sel}", { level: 6, title: "the Quiet" });
store.delete("characters{level:<2}");
```

| Method                 | Does                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `update(query, value)` | Replaces each match with `value`, or with `value(current, location)`.                                      |
| `merge(query, patch)`  | Shallow-merges `patch` into each match that is an object; skips others.                                    |
| `delete(query)`        | Removes each match from its container: a row from a table, a key from an object, an element from an array. |

Each returns how many matches it wrote. `Table` has the same three, starting at its rows.

### Writes hit every match

That follows from [sets](./index#sets-not-single-values). To write one, narrow the query —
`characters{name:Sel}[0]` — or pass `{ limit: 1 }`. Take particular care with `delete`.

### Writes copy

Nothing signal-held is mutated. A write copies each container between the target and the nearest
`Signal.State` above it, then sets that signal. So after
`store.update("characters{name:Sel}.level",
6)`:

- `characters.rows` holds a new array;
- Sel is a new object, with the new level;
- Vex is the **same** object as before.

That is what lets a `Signal.Computed`, or `each()` with its shallow diff, see exactly what changed
and nothing more. A value that is itself a signal is `set()` directly, with nothing above it copied.
A `Signal.Computed` in the way is an error — it can't be written to.

Every write is one batch. Each container is copied at most once, so writing several matches under
one array lands in one copy; array removals apply highest index first, so indices don't shift under
a delete.

### Schemas are checked per write

After a batch, every row it changed is validated against its table's schema. If any fails, **every
signal the batch set is put back** and the `SchemaError` is thrown, with paths that start at the
table:

```ts
store.update("characters{name:Sel}.level", "high");
// SchemaError: characters.0.level: Expected number, got string
```

Rows the write didn't touch aren't re-validated, so an already-invalid row doesn't block unrelated
writes.

## Writing through any data

`WriteBatch` is the write machinery without the store, for writing through `evaluate`'s locations on
data of your own:

```ts
import { evaluate } from "@bearmetal/bmql";
import { WriteBatch } from "@bearmetal/bmql/store";

const batch = new WriteBatch();
for (const location of evaluate(data, "characters{class:rogue}.level")) {
	batch.set(location, (location.value as number) + 1);
}
batch.commit();
```

It follows the same rules — copy up to the nearest signal, in place if there isn't one — and
`rollback()` restores every signal it set. In-place writes to plain data can't be rolled back.
