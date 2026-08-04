---
next:
    text: "Lifecycle"
    link: "./lifecycle"
prev:
    text: 'The `\components` Directory'
    link: "./component-directory"
---

# Templates

Templating in the BearMetal Stack is done with JSX. There is one JSX runtime and it always builds
real DOM nodes; on a server the `document` it builds them with is a microdom whose trees serialize
themselves, so one `template` covers both sides. Nothing about a component is written twice.

To set the template of a component, simply create a getter for `template`.

```tsx
@define("my-component")
export class MyComponent extends BMElement {
	get template() {
		return <h1>Hello, World!</h1>;
	}
}
```

## The Shadow DOM

In order to leverage shadow DOM functionality, `BMElement` exposes `this.useShadow()`. This enables
the use of DOM slots in the JSX of other components as well as giving access to the other benefits
of the shadow DOM.

```tsx
@define("my-component")
export class MyComponent extends BMElement {
	init() {
		this.useShadow();
	}

	get template() {
		return (
			<>
				<slot name="slot-1"></slot>
				<hr />
				<slot name="slot-2"></slot>
				<hr />
				<slot name="slot-3"></slot>
			</>
		);
	}
}

// usage
<my-component>
	<div slot="slot-1"></div>
	<div slot="slot-2"></div>
	<div slot="slot-3"></div>
</my-component>;
```

::: warning
A shadow root is a browser-side thing. `useShadow()` is called from `init()`, which does
not run during a server render, so the server puts the template in the component's light DOM and
replaces whatever children were passed to it. The slotted content is lost, and the browser
re-renders into a shadow root on top of the leftovers.

For a component built around `<slot>`, mark it `static client = true`. The server then emits its tag
and its children untouched, and the browser slots them properly when the element upgrades. See
[Server-Side Rendering](/getting-started/ssr/rendering#things-to-watch-for).
:::
