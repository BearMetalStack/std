# Migrating: refs are now signals (`@bearmetal/app`)

This document is written to be handed to an agent working in a codebase that consumes
`@bearmetal/app` and uses `ref="name"` / `this.refs` / `getRefs()`. It describes exactly what
changed, why, and how to find and convert every affected call site.

## What changed

Before this change, `this.refs.name` (and `getRefs()`'s return value) resolved directly to the
`Element` a `ref="name"` attribute registered — a plain DOM handle, read synchronously. There was an
implicit ordering guarantee: refs were registered before `init()` ran, so reading `this.refs.name`
inside `init()` was safe as long as the ref's element was part of the same render.

As of this change, **every ref is a `Signal.State<Element | undefined>`.** `this.refs.name` and
`getRefs()`'s properties are signals, not elements. There is no ordering guarantee to rely on
anymore — a ref starts `undefined` and is set once its element renders (and reset to `undefined` if
a reactive template re-renders without it), the same as any other signal in the codebase.

| Before                                     | After                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `this.refs.name` is `Element \| undefined` | `this.refs.name` is `Signal.State<Element \| undefined>`                                         |
| Read directly: `this.refs.name.value = x`  | Read via `.get()`: `this.refs.name.get()?.value = x` (or guard)                                  |
| `getRefs<T>()` returns `T`                 | `getRefs<T>()` returns `RefSignals<T>` (each property wrapped in `Signal.State`)                 |
| Safe to read synchronously in `init()`     | Read from inside `this.addEffect()`/`this.computed()`, or guard a one-off read with a null check |

The generic type argument you pass to `BMElement<{...}>` / `getRefs<{...}>()` is **unchanged** — it
still names element types (`BMElement<{ input: HTMLInputElement }>`), not signal types. Only what
`this.refs.name` resolves to at the value level changed.

`ref="..."` declaration sites in JSX (`<input ref="search" />`) are **unchanged** — nothing about
declaring a ref is different, only reading one.

## Why

Refs used to be an untracked, ordering-dependent side channel invisible to the reactive graph — the
opposite of every other piece of state in a BearMetal component. Making them real signals removes
the special case: ref population is now an ordinary signal write, and consumers use the same
`computed()`/`effect()` discipline they already use everywhere else.

## Finding call sites to convert

Run these from the root of the consuming repo:

```bash
# Every read of a ref via this.refs.<name>
grep -rn '\.refs\.[a-zA-Z_$][a-zA-Z0-9_$]*' --include='*.ts*'

# Every getRefs() call
grep -rn 'getRefs(' --include='*.ts*'

# ref="..." declarations — informational only, these do not need to change
grep -rn 'ref="' --include='*.tsx'
```

For each match against `.refs.<name>`, check whether it's:

- a **direct property access/assignment or method call** on the element (`this.refs.name.value`,
  `this.refs.name.focus()`, `this.refs.name.append(...)`) — these all need a `.get()` and a guard.
- a **type annotation or generic argument** (`BMElement<{ name: HTMLInputElement }>`,
  `getRefs<{...
  }>()`) — these are unchanged, skip them.

## Conversion patterns

**One-off read in an event handler or callback** — guard before use:

```ts
// before
onClick={() => { this.refs.search.value = term; }}

// after
onClick={() => {
	const search = this.refs.search.get();
	if (search) search.value = term;
}}
```

**Read inside an existing `addEffect()`/timer callback** — insert the guard at the top:

```ts
// before
protected init() {
	this.addEffect(() => {
		this.refs.joke.append(<p>{line}</p>);
	});
}

// after
protected init() {
	this.addEffect(() => {
		const jokeEl = this.refs.joke.get();
		if (!jokeEl) return;
		jokeEl.append(<p>{line}</p>);
	});
}
```

**Imperative code called repeatedly (per-frame, per-event) that isn't already inside an effect** —
fetch fresh each call rather than caching the element, since it may have been replaced by a
re-render between calls:

```ts
// before
sniff() {
	this.refs.root.style.setProperty("--sniff", "1.1");
}

// after
sniff() {
	const root = this.refs.root.get();
	if (!root) return;
	root.style.setProperty("--sniff", "1.1");
}
```

**Chained single call** — `?.` is often enough when there's nothing else to guard:

```ts
// before
queueMicrotask(() => this.refs.textarea.focus());

// after
queueMicrotask(() => this.refs.textarea.get()?.focus());
```

## Worked examples from this repo

These are real, compiling before/after pairs from `@bearmetal/app`'s own migration — use them as a
reference for the shape of the conversion:

- `app/examples/twitter-app/components/explore.tsx` — a one-off write inside an `onClick` handler.
- `app/examples/twitter-app/components/feed.tsx` — a one-off write plus a chained `.focus()` call in
  `init()`.
- `stack/examples/project/components/joke.tsx` — a `setInterval` callback reading a ref repeatedly.
- `sledge/mod.tsx` — nine call sites across a mix of animation-frame loops, pointer-move handlers,
  and one-off imperative methods; the largest real migration surface in this repo.

See [Referencing DOM Elements](../getting-started/components/dom-refs.md) for the current canonical
API reference once your call sites are converted.
