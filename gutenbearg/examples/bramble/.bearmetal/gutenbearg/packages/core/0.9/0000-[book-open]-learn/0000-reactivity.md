---
description: How signals, computed values and effects keep your UI in sync without a virtual DOM.
status: beta
updated: Oct 12, 2026
---

# Reactivity

## The mental model

Bramble tracks reads, not renders. When a component reads a [[signal]], Bramble records the dependency. When the signal changes, only the code that read it runs again. There is no diffing step and no component re-render.

```diagram
signal -[write]-> computed -[read]-> effect -> DOM
```

That chain is the whole system. Everything else on this page is a variation on it.

## Signals

A signal holds one value. Call it to read; call `.set()` to write.

```ts
import { signal } from "@bramble/core";

const count = signal(0);

count();          // 0
count.set(1);
count.update((n) => n + 1);
```

::: tip Reads are subscriptions
Calling `count()` inside a component, a [[computed]] or an [[effect]] subscribes that scope. Reading with `count.peek()` returns the value without subscribing.
:::

Signals compare with `Object.is` by default, so setting the same value twice notifies nobody. Pass `equals: false` when you store a mutable object and want every write to propagate.

## Derived values

A [[computed]] is a signal whose value comes from other signals. It is lazy: nothing runs until something reads it, and it caches until a dependency changes.

```ts
const price = signal(40);
const qty = signal(3);
const total = computed(() => price() * qty());
```

| Primitive | Holds state | Runs eagerly | Writable |
| --- | --- | --- | --- |
| `signal` | Yes | — | Yes |
| `computed` | Cached | No | No |
| `effect` | No | Yes | Through signals |

## Effects

An [[effect]] runs once immediately, then again whenever anything it read changes. Use effects for the edges of your app: DOM APIs, logging, network calls. Return a function to clean up before the next run.

```ts
effect(() => {
  const id = setInterval(tick, interval());
  return () => clearInterval(id);
});
```

::: warning Don't write the signal you read
An effect that sets a signal it also reads will loop. Bramble stops after 100 iterations and throws `CycleError`. Move the derived value into a `computed` instead.
:::

## Batching

Every `.set()` notifies subscribers synchronously. When you update several signals together, wrap the writes in [[batch]] so dependents run once with the final values.

```ts
batch(() => {
  first.set("Ada");
  last.set("Lovelace");
});
```

Event handlers attached through Bramble's JSX are batched automatically. You only need `batch` in timers, sockets and other callbacks Bramble doesn't own.

```diagram
set(first) -> queue
set(last) -> queue -[flush]-> effects run once
```

## Ownership and cleanup

Every effect and computed belongs to an [[owner]], usually the component that created it. When the owner unmounts, everything it owns is disposed. This is why effects inside components never leak.

- Effects created at module scope have no owner and live forever.
- `createRoot(fn)` creates a detached owner you dispose yourself.
- `onCleanup(fn)` registers teardown on the current owner.

::: danger Async boundaries lose the owner
Code after an `await` runs outside the owner that started it. Capture it first with `getOwner()` and restore it with `runWithOwner()`.
:::

## Common pitfalls

1. **Destructuring props.** `const { name } = props` reads once. Read `props.name` where you use it.
2. **Reading outside a scope.** A signal read outside any tracked scope is a plain value and never updates.
3. **Storing derived state.** If it can be computed from other signals, make it a `computed`.

The full option list for each primitive lives in the reference, starting with [signal()](../0016-[brackets-curly]-reference/0000-signal.md).
