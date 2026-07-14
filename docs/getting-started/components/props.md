---
prev:
  text: "List Rendering"
  link: "./lists"
next: false
---

# Props

Props are declared with the `@prop` decorator on an `accessor` field initialized to a signal. The
accessor _is_ the signal — there's no separate value/signal split to think about.

```tsx
import { BMElement, define, prop } from "@bearmetal/app";

@define("my-counter")
export class MyCounter extends BMElement {
	@prop()
	accessor count = this.signal(0);
	@prop()
	accessor label = this.signal("Count");

	get template() {
		return <p>{this.label}: {this.count}</p>;
	}
}
```

```tsx
<my-counter count={5} label="Total" />;
```

`this.count` is a `Signal.State<number>`, the same as any other signal in the framework: read it
with `.get()`, write it with `.set()`, or bind it straight into a template as `{this.count}` for a
reactive child. It's usable anywhere a bare signal is — `each()`, effects, `Show`/`Switch`.

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

The type is inferred from the signal's initial value, and it is what an attribute is coerced back
to. Attributes are always strings, so the declared type is how `count="42"` becomes the number `42`.

```tsx
@prop() accessor count = this.signal(0);       // number
@prop() accessor label = this.signal("");      // string
@prop() accessor open = this.signal(false);    // boolean
```

Pass the type explicitly when the initial value can't carry it:

```tsx
@prop(Number) accessor count = this.signal<number | undefined>(undefined);
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

Objects and functions are set as properties on the element rather than as attributes, so there's no
attribute for `observedAttributes` to watch. As a signal, `count`-style props are still watchable
regardless of value type — this only affects whether a _parent writing an attribute_ is observed.

```tsx
<my-list items={["a", "b"]} />;
```

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

Whatever `serverLoad` returns is serialized onto the element and rehydrated on the client: if a
`@prop` declares that name, its signal is set directly; otherwise it falls back to a signal on
`this.signals.$user`, since there's no accessor to reach an undeclared prop by.
