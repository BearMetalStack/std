---
prev:
  text: "Server-Side Rendering"
  link: "./index"
next:
  text: "The render API"
  link: "./rendering"
---

# Loading Data on the Server

A component loads what it needs in `serverInit()` and marks what should survive the trip to the
browser with `@state`. Both are ordinary members of the class, there is no props bag and no second
instance.

```tsx
import { BMElement, define, prop, state } from "@bearmetal/app";

@define("user-card")
export class UserCard extends BMElement {
	@prop()
	accessor userId = this.signal("");

	@state()
	accessor user = this.signal<User | null>(null);

	override async serverInit() {
		this.user.set(await db.user(this.userId.get()));
	}

	override get template() {
		return <h2>{this.computed(() => this.user.get()?.name ?? "…")}</h2>;
	}
}
```

## `serverInit()`

Runs once, when the component connects **during a server render**, and never in a browser. Its body
is removed before the bundler reads the file, so the queries and file reads inside it — and the
imports that existed only to serve them — never reach the client.

It sets state directly. There is no return value to thread anywhere.

The renderer does not wait for it before rendering. It renders immediately, collects every
`serverInit()` on the page, awaits them together, and lets the signals they wrote patch the markup
that already exists. Ten components on a page cost one round trip, not ten, and siblings load in
parallel rather than in tree order:

```tsx
<div>
	<user-card userId="a" /> {/* both start */}
	<user-card userId="b" /> {/* before either finishes */}
</div>;
```

Everything up to the first `await` is synchronous, so it is already in place for the first render
pass. Everything after arrives through the signals it writes.

A component whose `serverInit()` reveals another component gets that one loaded too: the renderer
goes round again for whatever the last pass produced. It gives up after ten passes and warns, which
only happens when a `serverInit()` starts new work every time it settles.

If a `serverInit()` rejects, the rejection is logged and the render carries on. One component
failing to load is a hole in the page, not a lost response.

## `@state`

`@state()` marks a signal as part of the component's serializable state. Once the tree has settled,
the renderer snapshots every one of them into the element's own markup:

```html
<user-card data-bm-state='{"user":{"name":"Ada"}}'>
	<h2>Ada</h2>
</user-card>
```

When that element upgrades in the browser, it reads the attribute back into the same signals before
its first client render and removes it. `this.user` is already populated; nothing is fetched twice,
and there is no flash of the empty state.

This holds however deep the component is. A component's first client render replaces its children
rather than adopting them, so a nested `<user-card>` is discarded along with the markup that carried
its state; the snapshots are lifted out of the document before any of that happens and handed to
whichever component is rebuilt in the same place. Position here means the chain of component tags
down to the element, so a component can only ever be given state that was rendered somewhere
structurally identical.

It is a boot-time handover and only that: a component created by a later re-render is a new
component, and starts from its declared values rather than from the page the server sent.

Because hydration lands in the signal itself, a component's state is reachable the way it always
was: `this.user`, not a bag keyed by string.

Anything that survives `JSON.stringify` can be state. Anything that cannot, such as a `Map`, a
`Date`, a class instance, or a function should be derived in `init()` from something that can.

::: warning `@state` is markup, and markup is public. It is the component's starting values written
into the page in plain text. Don't put in it anything the person reading the page shouldn't see. :::

### `@state` is not `@prop`

They are independent, and a signal can carry both decorators when it needs to.

|            | `@prop()`                               | `@state()`                               |
| ---------- | --------------------------------------- | ---------------------------------------- |
| Means      | an input, from whoever used the tag     | what the component worked out for itself |
| Written by | the parent, as an attribute or a signal | the component, usually in `serverInit()` |
| Serialized | no — see below                          | yes, into `data-bm-state`                |

::: warning A prop does not cross to the browser on its own. Setting a declared `@prop` writes the
child's signal directly rather than an attribute. That is what makes a signal prop a live binding
rather than a string round-trip. Thus, it leaves no trace in the markup.

Inside a page that is entirely components this is invisible: the parent's `template` runs again in
the browser and hands the child the same props it did on the server. It matters at the boundary,
where a `Page()` view passes server data into a component:

```tsx
router
	.route("/dashboard")
	.get(Page((ctx) => <dashboard-page user={ctx.state.user} />));
```

That `user` configures the server render and then it is gone. The view is not a component and does
not run again in the browser. Load it in the component's `serverInit()` and mark it `@state`
instead, and it will be there on both sides. An undeclared attribute (`data-…`, or any name the
component has no accessor for) does serialize, which is enough for small scalars a component can
read back itself. :::

## The other half: `init()`

`init()` is the browser half of the lifecycle and does not run during a server render. Listeners,
timers, subscriptions and anything else that needs a live document belong there; loading belongs in
`serverInit()`.

```tsx
override async serverInit() {
	this.rows.set(await db.rows());   // server only
}

override init() {
	const id = setInterval(tick, 1000); // browser only
	return () => clearInterval(id);
}
```

Neither is required. A component with neither renders its `template` on both sides and that is that.

## Components that shouldn't render server-side

Some components have nothing worth serializing such as a canvas, a media player, or a map. Mark the
class `client` and the server emits its tag and attributes and stops:

```tsx
@define("big-chart")
export class BigChart extends BMElement {
	static override client = true;

	override get template() {
		return <canvas ref="canvas" />;
	}
}
```

```html
<big-chart data-series="revenue"></big-chart>
```

The browser builds it from scratch when the element upgrades. Reach for this only when server markup
would genuinely be thrown away. Everything else should render, so the page has content before the
bundle lands.
