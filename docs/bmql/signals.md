# Signals

BMQL reads through `Signal.State` and `Signal.Computed` (from `@bearmetal/app/signals`) wherever
they appear in the data: the root, an array, a key's value, an array element, a filter variable.
Nested signals are read through too. You never write `.get()` in a query.

```ts
import { Signal } from "@bearmetal/app/signals";
import { values } from "@bearmetal/bmql";

const backstory = new Signal.State("Born in the Ashen Reach.");
const data = {
	characters: new Signal.State([
		{
			name: new Signal.State("Sel"),
			properties: new Signal.State([{ key: "backstory", value: backstory }]),
		},
	]),
};

values(data, "characters{name:Sel}.properties{key:backstory}.value");
// ["Born in the Ashen Reach."]
```

That is `unwrapSignal`, the default `unwrap` option. Pass `unwrap: (v) => v` to treat signals as
ordinary values, or your own function to read through some other kind of box.

## Live queries

Because every read goes through a signal's `get()`, a query evaluated inside a `Signal.Computed`
subscribes to exactly the signals it read on the way to its result. `compute` and its siblings do
the wrapping:

```ts
import { compute, computeText, computeValues } from "@bearmetal/bmql";

const result = computeValues(data, "characters{name:Sel}.properties{key:backstory}.value");
result.get(); // ["Born in the Ashen Reach."]
backstory.set("Raised by wolves.");
result.get(); // ["Raised by wolves."]
```

| Function        | Holds                           | Equality                               |
| --------------- | ------------------------------- | -------------------------------------- |
| `compute`       | `Location[]`                    | Same parents, keys, values and cells.  |
| `computeValues` | `unknown[]`                     | Same values, by `Object.is`, in order. |
| `computeText`   | `string` (see [Pipes](./pipes)) | The string.                            |

All three parse the query immediately, so a syntax error throws at the call rather than on the first
read.

## What gets tracked

Exactly what the evaluation read, and nothing else. For the query above:

| Signal                                  | Tracked | Why                                       |
| --------------------------------------- | ------- | ----------------------------------------- |
| `characters`                            | yes     | Every character is read.                  |
| every character's `name`                | yes     | The filter has to test each one.          |
| a filtered-out character's `properties` | no      | Evaluation never reaches past the filter. |
| Sel's `properties`                      | yes     |                                           |
| Sel's backstory `value`                 | yes     | It is the result.                         |
| any other property's `value`            | no      | Only its `key` was read, by the filter.   |

So renaming any character re-runs the query — someone might have just become Sel — but writing to a
property nobody selected does not.

`compute` and `computeValues` also compare each new result with the last before reporting a change.
A re-run that lands on the same result (Vex renamed to Vexxa: the filter re-ran, Sel's backstory is
unchanged) wakes nothing that depends on it.

To see what a result depends on, call `Signal.subtle.introspectSources(result)` after a `get()`.

## Writing back

A location read out of a signal carries that signal as `cell`:

```ts
const [location] = evaluate(data, "characters{name:Sel}.properties{key:backstory}.value");
location.cell === backstory; // true
(location.cell as Signal.State<string>).set("…");
```

Writing `location.parent[location.key]` instead would replace the signal with a plain value. The
[store](./store) and `WriteBatch` do the right thing automatically, including when the target is
plain data somewhere below a signal.
