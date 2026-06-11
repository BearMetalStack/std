# @bearmetal/events

Promise- and async-generator-based event utilities for `EventTarget` and `EventSource`.

```ts
import { BearMetalEventTarget, type EventMap } from "@bearmetal/events";
```

## Quick start

```ts
type AppEvents = {
  "data:received": { detail: { payload: string } };
  "data:error":    { detail: { message: string } };
};

const bus = new BearMetalEventTarget<AppEvents>();

bus.dispatchEvent(new CustomEvent("data:received", { detail: { payload: "hello" } }));

const event = await bus.once("data:received");
event.detail.payload; // string -- typed from AppEvents
```

---

## EventMap

`EventMap` is the type parameter that drives inference on `BearMetalEventTarget` and `BearMetalEventSource`. It maps event type strings to their `CustomEvent` detail shapes:

```ts
import { type EventMap } from "@bearmetal/events";

type MyEvents = {
  "task:created": { detail: { id: string; title: string } };
  "task:deleted": { detail: { id: string } };
  "app:ready":    { detail: never };
};
```

Every key is an event type string; the value is `{ detail: T }` where `T` is the type of `CustomEvent.detail`.

---

## BearMetalEventTarget

A typed subclass of `EventTarget`. Extend it for your own classes or instantiate it directly as a shared event bus.

```ts
class TaskStore extends BearMetalEventTarget<MyEvents> {
  create(title: string) {
    const id = crypto.randomUUID();
    this.dispatchEvent(new CustomEvent("task:created", { detail: { id, title } }));
    return id;
  }
}
```

All methods below are available as instance methods and infer event types from `TMap`. Unrecognised event type strings fall back to the base `Event` type.

| Method | Returns | Description |
|---|---|---|
| `once(type)` | `Promise<Event>` | Resolves with the next occurrence |
| `race(types[])` | `Promise<Event>` | Resolves with whichever type fires first |
| `stream(type)` | `AsyncGenerator<Event>` | Yields every occurrence |
| `debounce(type, wait)` | `Promise<Event>` | Resolves after `wait`ms of silence |
| `throttle(type, wait)` | `AsyncGenerator<Event>` | Yields at most one per `wait`ms window |
| `buffer(type, wait)` | `Promise<Event[]>` | Collects all events over `wait`ms |
| `promiseEvent(type, responseType, detail)` | `Promise<Event[]>` | Dispatches and collects synchronous responses |
| `filteredEvent(type, responseType, predicate, detail?)` | `Promise<Event[]>` | Same as `promiseEvent`, filtered |
| `pipeTo(destination, type, transform?)` | `() => void` | Forwards events; returns teardown |

---

## BearMetalEventSource

A typed subclass of `EventSource` with the same method API as `BearMetalEventTarget`. Use it when you need the standard `EventSource` SSE connection interface alongside the helper methods.

```ts
class LiveFeed extends BearMetalEventSource<FeedEvents> {
  constructor() {
    super("/api/events");
  }
}

const feed = new LiveFeed();
for await (const event of feed.stream("post:published")) {
  render(event.detail);
}
```

---

## Standalone functions

All methods on the typed classes delegate to these standalone functions. Use them directly when working with any `EventTarget` you don't own.

### onceEvent(target, type)

Resolves with the next occurrence of `type`. The listener is registered with `{ once: true }` and removes itself automatically.

```ts
const click = await onceEvent(button, "click");
```

### raceEvent(target, types[])

Resolves with whichever event fires first. Internally wraps `onceEvent` for each type in `Promise.race`.

```ts
const result = await raceEvent(dialog, ["confirm", "cancel"]);
if (result.type === "confirm") { ... }
```

### eventStream(target, type)

An async generator that yields every occurrence in order, buffering events that arrive while the consumer is awaiting. The listener is removed when the generator is closed via `break` or `return`.

```ts
for await (const event of eventStream(target, "message")) {
  process(event);
}
```

**Gotcha:** the listener is not registered until the first `.next()` call (i.e., the start of a `for await...of` loop). Events dispatched between calling `eventStream()` and that first iteration are silently dropped. Go straight into the loop rather than storing the generator across an `await`.

```ts
// BAD -- events fired during the fetch are lost
const stream = eventStream(target, "update");
await fetch("/something");
for await (const e of stream) { ... }

// GOOD -- listener registers immediately
for await (const e of eventStream(target, "update")) { ... }
```

### debounceEvent(target, type, wait)

Resolves with the last occurrence after `wait`ms of silence. Resets the timer on every event; the listener removes itself on resolution.

```ts
const final = await debounceEvent(input, "input", 300);
search(final.target.value);
```

### throttleEvent(target, type, wait)

An async generator that yields at most one event per `wait`ms window. Each iteration waits for both the next event and the end of the window before yielding, so the interval is always at least `wait`ms regardless of how fast events fire.

```ts
for await (const event of throttleEvent(target, "mousemove", 100)) {
  updateCursor(event);
}
```

### bufferEvent(target, type, wait)

Collects all occurrences over a `wait`ms window, then resolves with the full array. The listener is removed after the window closes.

```ts
const batch = await bufferEvent(target, "log", 500);
flush(batch);
```

### promiseEvent(target, type, responseType, detail)

Dispatches a `CustomEvent` of `type` with `detail`, then collects all synchronously fired `responseType` events on the next microtask tick. Useful for request/response patterns where multiple listeners each respond to a single dispatched event.

```ts
const responses = await promiseEvent(bus, "query:request", "query:response", { table: "users" });
responses.forEach((e) => handle(e.detail));
```

### filteredEvent(target, type, responseType, predicate, detail?)

Same as `promiseEvent`, but the collected responses are filtered through `predicate` before resolving. `detail` is optional.

```ts
const matches = await filteredEvent(
  bus,
  "lookup:request",
  "lookup:response",
  (e) => e.detail.id === targetId,
  { key: "name" },
);
```

### pipeEvent(target, destination, type, transform?)

Forwards every `type` event from `target` to `destination`. Without `transform`, the event is cloned structurally (same type, detail, bubbles, cancelable). With `transform`, you can produce a different event entirely. Returns a teardown function.

```ts
const stop = pipeEvent(localBus, globalBus, "status:update");

// later
stop();
```

With transform:

```ts
const stop = pipeEvent(
  rawSource,
  appBus,
  "raw:data",
  (e) => new CustomEvent("data:parsed", { detail: parse(e.detail) }),
);
```
