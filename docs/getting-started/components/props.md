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

Declaring a prop adds its name to the element's `observedAttributes`. Passing a plain value writes
it once as an attribute; the child's `observedAttributes` picks that up and updates its own signal.
Passing a signal is different — and this is the common case for anything that needs to change after
the initial render.

### Passing a signal binds it, it doesn't copy it

```tsx
@define("my-parent")
export class MyParent extends BMElement {
	#count = this.signal(0);

	get template() {
		return <my-counter count={this.#count} />;
	}
}
```

`count`'s accessor on `<my-counter>` already holds its own `Signal.State` (from
`accessor count = this.signal(0)`). When the JSX runtime sees that the incoming prop value is _also_
a signal, it swaps the child's signal for the parent's instead of mirroring the value through an
attribute. From then on `#count` on the parent and `count` on the child are the same `Signal.State`
object — either side calling `.set()` is immediately visible to the other, with no attribute
round-trip and no code on either side aware of the other.

This is what makes multi-step flows and things like a file picker's "current directory" work: pass a
signal down, let the child read and write it, and the parent sees every update without wiring up
callbacks.

```tsx
@define("wizard-step")
export class WizardStep extends BMElement {
	@prop()
	accessor value = this.signal("");

	get template() {
		return <input $bind={this.value} />;
	}
}

@define("signup-wizard")
export class SignupWizard extends BMElement {
	#name = this.signal("");

	get template() {
		// #name updates as the step's own input changes - same signal, both directions.
		return <wizard-step value={this.#name} />;
	}
}
```

Only a _writable_ signal (something with both `.get()` and `.set()`) triggers this — a read-only
`Signal.Computed` passed as a prop falls back to the one-way, attribute-mirrored behavior below,
since there's nothing for the child to write back to.

Passing a bare value (`count={5}`) still goes through the one-way path: the JSX runtime writes the
attribute once, `attributeChangedCallback` coerces it back to the declared type and calls `.set()`
on the child's own signal. That signal is private to the child; the parent has no reference to it
and won't see further writes.

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
attribute for `observedAttributes` to watch.

```tsx
<my-list items={["a", "b"]} />;
```

A signal is also an object, but it's handled by the binding behavior described above, not this one —
passing a signal never lands in `items` as a raw value; it replaces `items`'s own signal.

## Loading data on the server

A component renders on the server as itself — same instance, same `template` — so loading is an
ordinary method that sets state, not a static that returns a props bag.

```tsx
export class MyComponent extends BMElement {
	@prop()
	accessor id = this.signal("");
	@state()
	accessor user = this.signal<User | null>(null);

	override async serverInit() {
		this.user.set(await db.getUserById(this.id.get()));
	}

	override get template() {
		return <h1>Hello, {this.computed(() => this.user.get()?.firstName ?? "…")}!</h1>;
	}
}
```

The renderer does not wait for `serverInit()` before rendering. It renders immediately, collects
every `serverInit()` on the page, awaits them together, and lets the signals they wrote update the
markup that already exists — so ten components cost one round trip rather than ten.

Anything marked `@state` is written into the element's markup once the page has settled, and read
back into the same signal when the element upgrades in the browser — before its first client render.
`this.user` is already populated; nothing is fetched twice. `@state` is independent of `@prop`: a
prop is an input from the parent, state is what the component worked out for itself.

`init()` is the browser half of the lifecycle and does not run during a server render. Listeners,
timers and subscriptions go there; loading goes in `serverInit()`.
