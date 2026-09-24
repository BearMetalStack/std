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

To render a component into a shadow root, declare `static shadow` with the root's mode. This enables
the use of DOM slots in the JSX of other components as well as giving access to the other benefits
of the shadow DOM.

```tsx
@define("my-component")
export class MyComponent extends BMElement {
	static override shadow = "open" as const;

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

The declaration is read on both sides. A server render attaches the root and serializes it as
declarative shadow DOM (`<template shadowrootmode="open">`), with the children passed to the
component left in place for its slots. The browser rebuilds that root as it parses the page, and the
component's first client render replaces its contents.

::: warning
`this.useShadow()` still exists, but called from `init()` it is browser-only, because `init()` does
not run during a server render. The server then puts the template in the component's light DOM and
replaces whatever children were passed to it. Use `static shadow` for any component that is
server-rendered. Prefer `"open"`: the `@state` of components nested inside a closed root cannot be
recovered during hydration. See
[Server-Side Rendering](/getting-started/ssr/rendering#things-to-watch-for).
:::
