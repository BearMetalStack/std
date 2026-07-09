---
prev:
  text: "List Rendering"
  link: "./lists"
next: false
---

# Props

Props are declared with the `@prop` decorator on an `accessor` field. A declared prop is a signal,
so reading it inside a template or an effect is reactive.

```tsx
import { BMElement, define, prop } from "@bearmetal/app";

@define("my-counter")
export class MyCounter extends BMElement {
	@prop()
	accessor count = 0;
	@prop()
	accessor label = "Count";

	get template() {
		return <p>{this.label}: {this.signals.$count}</p>;
	}
}
```

```tsx
<my-counter count={5} label="Total" />;
```

Reading `this.count` gets the current value; assigning `this.count = 5` updates it and anything
watching it. The underlying signal is always available at `this.signals.$count`, which is what you
pass into JSX when you want the binding to be reactive — `{this.count}` reads once,
`{this.signals.$count}` re-renders.

## Reactivity

Declaring a prop adds its name to the element's `observedAttributes`. When a parent writes the
attribute, the signal updates:

```tsx
@define("my-parent")
export class MyParent extends BMElement {
	#count = this.signal(0);

	get template() {
		return <my-counter count={this.#count} />;
	}
}
```

Passing a signal as a prop makes the parent the owner: the JSX runtime opens an effect that writes
the attribute whenever the parent's signal changes, and the child's `observedAttributes` picks that
up and updates its own signal. Neither side has to know about the other.

## Types

The type is inferred from the initializer, and it is what an attribute is coerced back to.
Attributes are always strings, so the declared type is how `count="42"` becomes the number `42`.

```tsx
@prop() accessor count = 0;      // number
@prop() accessor label = "";     // string
@prop() accessor open = false;   // boolean
```

Pass the type explicitly when the initializer can't carry it:

```tsx
@prop(Number) accessor count = undefined;
```

### String and Boolean Values

Strings and booleans are written to the DOM as attributes, which means you can select on them with
attribute selectors.

```tsx
<my-counter label="Total" open />;
```

```css
my-counter[open] {
	border-color: red;
}
```

A boolean prop follows attribute semantics: present is `true`, absent is `false`. So `open` and
`open=""` both read back as `true`, and removing the attribute makes it `false`. This is why
booleans need to be declared — without a type there is no way to tell an absent boolean from an
empty string.

### Objects

Objects and functions are set as properties on the element rather than as attributes. They work as
props, but they are never observed, because there is no attribute for `observedAttributes` to watch.

```tsx
<my-list items={["a", "b"]} />;
```

If you need to watch one, pass a signal.

## Accessing Server Side Props

There is no element instance on the server, so `serverLoad` and `serverRender` receive props as
their first argument. `serverRender` also sees any additional props produced by `serverLoad`.

```tsx
export class MyComponent extends BMElement {
	static async serverLoad(props: { id: string }) {
		const user = await db.getUserById(props.id);
		return { user }; // becomes a signal on the client
	}

	static serverRender(props: { id: string; user: User }) {
		return <h1>Hello, {props.user.firstName}!</h1>;
	}
}
```

Whatever `serverLoad` returns is serialized onto the element and rehydrated into
`this.signals.$user` on the client — the same place a declared prop's signal lives.
