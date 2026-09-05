---
next:
  text: "List Rendering"
  link: "./lists"
prev:
  text: "Reactivity"
  link: "./reactivity"
---

# Referencing DOM Elements

`BMElement` exposes a simple way of tracking DOM references: a simple `ref` attribute set to the
name you would like the ref to take.

```tsx
<div>
	<p ref="paragraph"></p>
</div>;
```

Each ref is a `Signal.State<Element | undefined>` — read it with `.get()` the same way you'd read
any other signal, typically from inside `this.addEffect()` or `this.computed()`. It starts
`undefined` and is set once the element it names has rendered, so guard against `undefined` rather
than assuming it's already there.

```tsx
protected init() {
	this.addEffect(() => {
		const paragraph = this.refs.paragraph.get();
		if (!paragraph) return;
		paragraph.textContent = "Hello, ref!";
	});
}
```

`init()` always runs _before_ the template renders, so `this.refs.paragraph` is guaranteed
`undefined` if you call `.get()` on it synchronously inside `init()` itself. The effect above simply
fires once the template registers the ref — the same as it would for any other signal it reads.

## Refs in Functional Components

Functional components have no `this`, and so no `this.refs`. Instead, `@bearmetal/app` exposes
`getRefs()`, which reads the ref signals of the nearest owning component.

```tsx
import { effect, getRefs } from "@bearmetal/app";

function Field() {
	const refs = getRefs<{ input: HTMLInputElement }>();
	const input = <input ref="input" />;
	effect(() => refs.input.get()?.focus());
	return input;
}
```

`getRefs()` takes the same type argument that `BMElement` does, for the same reason. See
[Typing `this.refs`](#typing-this-refs) below.

Like `createEffect()` and `each()`, `getRefs()` needs an owner. Called outside of a component, an
`init()`, or an `each()` render callback, it warns and hands back an empty view.

::: warning Refs share one namespace per component Refs are registered against the owning
`BMElement`, not against the functional component that declared them. Two instances of the same
functional component under one parent will therefore collide on the same ref name, and the last one
registered wins. Name your refs accordingly. :::

## Typing `this.refs`

Ref type inference is something that is currently very difficult to do automatically, so as a
workaround you can currently type the refs of a component by passing a type argument to BMElement —
same as always, an element type per ref name.

```ts
@define("component")
export class Component extends BMElement<{ paragraph: HTMLParagraphElement }> {
	init() {
		this.addEffect(() => {
			const paragraph = this.refs.paragraph.get(); // HTMLParagraphElement | undefined
		});
	}
}
```

`this.refs.paragraph` itself resolves to `Signal.State<HTMLParagraphElement | undefined>` — the
generic argument still names the element type, and `this.refs`/`getRefs()` wrap each one in a signal
for you.
