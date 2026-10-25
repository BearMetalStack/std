---
description: A cached, read-only value derived from other signals.
status: beta
new: true
---

# computed()

```signature [packages/core/src/computed.ts]
function computed<T>(fn: () => T): ReadonlySignal<T>
```

## Behaviour

- Lazy: `fn` runs on the first read, not on creation.
- Cached until one of the [[signal|signals]] it read changes.
