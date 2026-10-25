---
description: Create a reactive value that notifies its subscribers when it changes.
status: beta
updated: Sep 28, 2026
---

# signal()

```signature [packages/core/src/signal.ts]
function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T>
```

## Parameters

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `initial` | `T` | — | The starting value. |
| `options.equals` | `((a: T, b: T) => boolean) or false` | `Object.is` | Decides whether a write notifies. `false` always notifies. |
| `options.name` | `string` | — | Label shown in devtools and in `CycleError` messages. |

## Returns

A `Signal<T>`: a function you call to read, with these members attached.

| Member | Type | Description |
| --- | --- | --- |
| `()` | `T` | Read the value and subscribe the current scope. |
| `.peek()` | `T` | Read without subscribing. |
| `.set(value)` | `void` | Replace the value. |
| `.update(fn)` | `void` | Replace the value with `fn(current)`. |
| `.subscribe(fn)` | `() => void` | Listen outside a tracked scope. Returns an unsubscribe function. |

## Example

```ts
import { signal, effect } from "@bramble/core";

const user = signal({ name: "Ada" }, { name: "user", equals: false });

effect(() => console.log(user().name));

user.update((u) => { u.name = "Grace"; return u; }); // logs "Grace"
```

## Behaviour

- Writes are synchronous. Subscribers run before `.set()` returns, unless inside [[batch]].
- Reading a signal inside its own [[effect]] and writing it there throws `CycleError` after 100 runs.
- Signals are not deep. Mutating an object in place does nothing unless you write it back.

::: info Renamed in 0.6 <Badge type="warn" text="deprecated alias"/>
`createSignal` is still exported as an alias for `signal` and will be removed in 1.0.
:::

## See also

- [Reactivity guide](../0000-[book-open]-learn/0000-reactivity.md) for how signals fit with computed values and effects.
- [computed()](0016-computed.md) for derived values.
