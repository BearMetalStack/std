---
next:
    text: 'List Rendering'
    link: './lists'
prev:
    text: 'Reactivity'
    link: './reactivity'
---

# Referencing DOM Elements

`BMElement` exposes a simple way of tracking DOM references: a simple `ref` attribute set to the name you would like the ref to take.
```tsx
<div>
    <p ref="paragraph"></p>
</div>
```
Accessing the refs is easily done through `this.refs`.

```tsx
const paragraph = this.refs.paragraph;
paragraph.textContent = 'Hello, ref!';
```

## Refs in Functional Components

Functional components have no `this`, and so no `this.refs`. Instead, `@bearmetal/app` exposes `getRefs()`, which reads the refs of the nearest owning component.

```tsx
import { getRefs } from "@bearmetal/app";

function Field() {
    const refs = getRefs<{ input: HTMLInputElement }>();
    const input = <input ref="input" />;
    queueMicrotask(() => refs.input.focus());
    return input;
}
```

`getRefs()` takes the same type argument that `BMElement` does, for the same reason — see [Typing `this.refs`](#typing-this-refs) below.

`getRefs()` returns a live view rather than a snapshot, so read from it *after* the JSX declaring the ref has been evaluated. Reading `refs.input` on the line above `<input ref="input" />` gives you `undefined`.

Like `createEffect()` and `each()`, `getRefs()` needs an owner. Called outside of a component, an `init()`, or an `each()` render callback, it warns and hands back an empty view.

::: warning Refs share one namespace per component
Refs are registered against the owning `BMElement`, not against the functional component that declared them. Two instances of the same functional component under one parent will therefore collide on the same ref name, and the last one registered wins. Name your refs accordingly.
:::

## Typing `this.refs`

Ref type inference is something that is currently very difficult to do automatically, so as a workaround you can currently type the refs of a component by passing a type argument to BMElement.

```ts
@define("component")
export class Component extends BMElement<{ paragraph: HTMLParagraphElement }> {
    init() {
        const paragraph = this.refs.paragraph // HTMLParagraphElement
    }
}
```
