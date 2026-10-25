---
description: How signals and effects keep your UI in sync.
status: alpha
---

# Reactivity

## The mental model

Bramble 0.8 tracks reads, not renders. Create values with [createSignal()](../0016-[brackets-curly]-reference/0016-create-signal.md) and react to them with effects.

```diagram
createSignal -[write]-> effect -> DOM
```

::: info Effects are asynchronous in 0.8
An effect's first run is queued in a microtask. 0.9 runs it synchronously.
:::
