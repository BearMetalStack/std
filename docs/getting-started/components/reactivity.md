---
prev:
  text: "Lifecycle"
  link: "./lifecycle"
next:
  text: "DOM refs"
  link: "./dom-refs"
---

# Reactivity

Reactivity is driven by [Signals](https://github.com/tc39/proposal-signals). This enables granular
in-place DOM updates.

## Signals

There are two ways to create a signal. Which one you use depends on the specific case you are
working in.

### `BMElement.prototype.signal()`

Inside of a class component, you can call `this.signal()` with a default value to initialize a
signal. Where you store it is up to you, but it is recommended that you store it as a private member
of the component.

```tsx
@define("my-component")
export class MyComponent extends BMElement {
	#signal = this.signal("Hello, World!");

	get template() {
		return <h1>{this.#signal}</h1>;
	}
}
```

### `createSignal()`

`@bearmetal/app` exposes a `createSignal` function that will return a signal using the provided
default value. This is most useful for closures within functional components, but can be used to
some extent as a standalone feature.

```tsx
import { createSignal, define } from "@bearmetal/app";

const signal = createSignal("Hello, World!");

@define("my-component")
export class MyComponent extends BMElement {
	get template() {
		return <h1>{signal}</h1>;
	}
}
```

### Computed Signals

Computed signals are derived from other signals using a function. They are updated automatically
when the signals they depend on change. These have a similar API to that of the normal
`createSignal` function, but take in a callback instead of a value.

```tsx
import { createComputed, createSignal, define } from "@bearmetal/app";

const signal = createSignal("Hello, World!");
const computed = createComputed(() => signal.get() + "!");

@define("my-component")
export class MyComponent extends BMElement {
	#computed = this.computed(() => computed.get() + "!");
	get template() {
		return (
			<>
				<h1>{signal}</h1> {/* Hello, World! */}
				<h2>{computed}</h2> {/* Hello, World!! */}
				<h3>{this.#computed}</h3> {/* Hello, World!!! */}
			</>
		);
	}
}
```

## Effects

::: warning Effect Ownership

In order for effect cleanups to fire properly, you must, at a minimum, have a root component. Effect
cleanup happens at **disconnect** of the **nearest** parent `BMElement`

Because of this, it could be problematic to save refs to effectful children without manually
defining an effect owner or cleaning up manually. :::

Effects are effectively watchers of any number of signals. Much like signals, effects can be created
in two ways depending on the context, however they do behave slightly differently from each other.

### `BMElement.prototype.addEffect()`

`BMElement.prototype.addEffect()` is a method that allows you to define an effect within a
`BMElement` component. It takes in a callback function that will be executed whenever the signals it
depends on change. The cleanup for this effect is automatically collected and run during
`onDisconnect`

```tsx
@define("my-component")
export class MyComponent extends BLElement {
	init() {
		this.addEffect(() => {
			// Effect logic here
			return () => {
				// Cleanup logic here
			};
		});
	}
}
```

### `createEffect()`

`createEffect()` is a utility function that allows you to define an effect outside of a `BMElement`
component. It takes in a callback function that will be executed whenever the signals it depends on
change. The cleanup for this effect is returned and must be called at cleanup if there is no effect
owner set.

```tsx
const cleanup = createEffect(() => {
	// Effect logic here
	return () => {
		// Cleanup logic here
	};
});

// during cleanup
cleanup();
```

This is useful for effectful functional components, but you should be aware of the possible memory
leaks that can occur from unowned cleanup.

Called from a class field initializer of a `@define`d component — directly, or through a helper —
the element being constructed owns the effect: it runs straight away, stops when the element
disconnects and starts again when it reconnects.

```tsx
function preference<T>(key: string, initial: T) {
	const value = createSignal<T>(JSON.parse(localStorage.getItem(key) ?? "null") ?? initial);
	createEffect(() => localStorage.setItem(key, JSON.stringify(value.get())));
	return value;
}

@define("settings-panel")
class SettingsPanel extends BMElement {
	theme = preference("theme", "dark"); // owned by the panel
}
```

### Writing signals from effects

A signal written from inside an effect notifies whatever reads it, one pass later. Prefer deriving
with a computed where you can, since a mirrored copy is one more thing to keep consistent; and
effects that keep writing what each other read are stopped, with a warning, after 100 passes in a
row.

## Lazy signals

`LazySignal` starts from an initial value and fetches the real one the first time it is read. A
function that returns `new LazySignal(...)` hands every caller a new, empty signal, which a
re-running computed only ever sees empty — `createLazySignals` memoizes them by argument instead:

```tsx
const characters = createLazySignals([], (project: string) => api.characters(project));

const names = createComputed(() => characters(projectId.get()).get().map((c) => c.name));
characters.refresh(projectId.get()); // refetch one; also refreshAll(), delete(), clear()
```

## Saving

`createSaveTask(save, { debounceMs })` is the debounced save every editor ends up writing, with the
hard parts done once:

```tsx
const save = createSaveTask((doc: Doc) => api.put(doc), { debounceMs: 800 });

editor.addEventListener("input", () => save.schedule(editor.value));
save.status; // Signal: "idle" | "pending" | "saving" | "saved" | "error"
save.dirty; // Signal<boolean>: anything not saved yet, failures included
await save.flush(); // save now, after any save already running
```

- An edit made while a save is running is saved next. `"saved"` always means the latest edit.
- `flush()` waits for a save in flight before deciding whether there is anything left to save.
- A failed save stays dirty, puts the error on `save.error`, and retries with backoff (`retryMs`).
- Every task is reachable from `flushAllSaves()` — one call for Cmd/Ctrl+S that can't forget a kind
  of editor — and `hasUnsavedSaves()` answers a `beforeunload` prompt. Tasks are flushed, best
  effort, when the page is hidden.

Created in a component, a task is flushed and retired with it. Pass `{ owned: false }` when
something longer-lived holds it across re-renders of the component that uses it.
