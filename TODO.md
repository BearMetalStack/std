# bearmetal todos

## fixes

### reactive element children
Passing a signal to JSX only produces a reactive text node via `appendReactiveChild`.
There's no path for a signal that returns a `Node` or `Node[]` — you fall off the JSX
cliff and have to write `addEffect + container.replaceChildren(...)` by hand.

Options:
- Extend `appendReactiveChild` / `appendFlatChildren` to detect when a signal returns
  a `Node` and swap it in place (requires a sentinel/anchor node)
- Ship a `For` function component: `<For each={itemsSignal} render={(item) => <div>...</div>} />`
- Both

### context `parentBMC` gap
`domContext.inject` walks `current.parentBMC` but `BMC` never defines that property,
so the loop terminates after one step. Context only resolves if the consumer's direct
`parentElement` is the provider — deeper trees silently get `undefined`.

Fix: walk the real DOM parent chain looking for BMC instances:
```ts
// in inject()
current = [...up the parentElement chain...].find(isBMC) ?? null;
```
Or define a `get parentBMC()` getter on `BMC` that does this walk once.

### no object props on web components in JSX
`applyProp` calls `el.setAttribute(key, String(val))` for non-signal, non-boolean values,
so passing an object to a custom element in JSX silently becomes `"[object Object]"`.

Fix: check `typeof val === "object"` and set it as a DOM property (`(el as any)[key] = val`)
instead of an attribute. Primitive values stay as attributes; objects become properties.

---

## nice-to-haves

### `render()` naming / docs
The method name `render()` sets a React-like expectation that it re-runs on state changes.
It doesn't — it's a one-shot mount. Rename to `mount()` or `initialize()`, or add a
prominent doc comment explaining the actual model.

### keyed list reconciliation
`replaceChildren` tears down and rebuilds every node on each update, which drops focus,
resets scroll, and breaks CSS transitions. A minimal keyed diffing helper (keyed by an
`id` field) would make lists production-usable without a full virtual DOM.

### function components don't compose with signals
A function component (`(props) => Element`) can't call `this.signal()` or
`this.addEffect()`. Any dynamic behaviour has to be lifted into the parent `BmElement`.
A lightweight `createSignal` / `createEffect` free function (not tied to a component
instance) would let function components manage local state without upgrading to a full
custom element.

### no SSR partial hydration path
`static client = true` skips the element entirely during SSR. There's no way to render
a shell on the server and hydrate only parts of it. A `static serverShell()` that
returns static HTML while the client picks up from there would cover the most common
pattern.
