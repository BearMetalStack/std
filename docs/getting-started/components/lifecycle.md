---
prev:
  text: "Templates"
  link: "./templates"
next:
  text: "Reactivity"
  link: "./reactivity"
---

# Component Lifecycle

The component lifecycle in BearMetal is simple: `connected` and `disconnected`. Both stages are
accessed through `init()`

```tsx
@define("my-component")
export class MyComponent extends BMElement {
	init() {
		// Do things when `connectedCallback()` runs
		// Useful for effects
		console.log("`my-component` added to DOM");

		return () => {
			// Do things when `disconnectedCallback()` runs
			// Useful for cleanup
			console.log("`my-component` removed to DOM");
		};
	}
}
```

## The server half

`init()` is the browser half of that lifecycle. It does not run during a server render — listeners,
timers and subscriptions have nothing to attach to on a page that is about to become a string, and
starting them there would leak one set per request.

The server half is `serverInit()`: an async instance method, run once as the component renders on
the server and never in a browser. It is where loading goes.

```tsx
@define("my-component")
export class MyComponent extends BMElement {
	@state()
	accessor rows = this.signal<Row[]>([]);

	async serverInit() {
		this.rows.set(await db.rows()); // server only
	}

	init() {
		const id = setInterval(tick, 1000); // browser only
		return () => clearInterval(id);
	}
}
```

|                 | `serverInit()`                            | `init()`                             |
| --------------- | ----------------------------------------- | ------------------------------------ |
| Runs            | during a server render                    | when the element connects in the DOM |
| For             | loading the data the markup needs         | effects, listeners, timers, refs     |
| Reaches the     | markup, and `@state` carries it onward    | live page                            |
| In the browser? | no — its body is stripped from the bundle | yes                                  |

Both are optional. A component with neither renders its `template` on both sides and that is all it
does. The whole handoff is covered in [Server-Side Rendering](/getting-started/ssr/).

The template itself does not have halves: one `template`, one runtime, both sides.
