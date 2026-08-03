# @bearmetal/app

Framework for building reactive web components with optional server-side rendering.

## Quick start

### Component

```tsx
import { BMElement, define } from "@bearmetal/app";

@define("my-counter", import.meta)
class MyCounter extends BMElement {
	#count = this.signal(0);

	override get template() {
		return (
			<div>
				<span>{this.#count}</span>
				<button onClick={() => this.#count.set(this.#count.get() + 1)}>+</button>
			</div>
		);
	}
}
```

### SSR

```tsx
import { Layout, Page } from "@bearmetal/app/ssr";
import { Router } from "@bearmetal/router";

const router = new Router();

router
	.use(Layout(({ children }) => (
		<html>
			<head>
				<title>My App</title>
			</head>
			<body>{children}</body>
		</html>
	)))
	.route("/")
	.get(Page((_ctx) => <my-counter />));

Deno.serve(router.handle.bind(router));
```

---

## BMElement

`BMElement` is the base class for all web components. It wires together signals, effects, refs, and
context into a component lifecycle built on the browser's Custom Elements API.

### Registering a component

The `@define` decorator sets the element's tag name. When `import.meta` is provided, it also records
the module URL so `Page` can bundle the component for SSR.

```tsx
@define("my-button", import.meta)
class MyButton extends BMElement {}
```

For client-only components that are never used in SSR pages, `import.meta` is optional.

### Template

Override the `template` getter to define the component's DOM. It can return static JSX or a signal.
If a signal, the DOM re-renders reactively when its value changes.

```tsx
// static
override get template() {
  return <p>Hello</p>;
}

// reactive, re-renders when either signal changes
override get template() {
  return this.computed(() => (
    <p class={this.#active.get() ? "on" : "off"}>{this.#label}</p>
  ));
}
```

Signals passed directly into JSX bind the text node reactively without wrapping in `computed`:

```tsx
<span>{this.#count}</span>; // updates automatically
```

### init()

Called once after the template renders and the component connects to the DOM. Use it for effects,
event listeners, and one-time setup. Cleanup registered here runs automatically on disconnect.

```tsx
protected override init() {
  this.addEffect(() => {
    document.title = this.#title.get();
  });
}
```

### Signals and computed

```tsx
#value = this.signal(0);                               // Signal.State<number>
#double = this.computed(() => this.#value.get() * 2);  // Signal.Computed<number>
```

`signal()` and `computed()` are shorthand for `new Signal.State(...)` and
`new Signal.Computed(...)`. See the [Signals section](#signals----bearmetal-appsignals) for the full
API.

### Effects

```tsx
this.addEffect(() => {
	const el = this.refs.input as HTMLInputElement;
	el.value = this.#value.get();
	return () => {/* optional cleanup */};
});
```

Effects registered with `addEffect` are torn down when the component disconnects. The return value
is an optional cleanup function.

### Refs

Mark elements with a `ref` attribute to access them by name after render:

```tsx
override get template() {
  return <input ref="field" type="text" />;
}

protected override init() {
  (this.refs.field as HTMLInputElement).focus();
}
```

For typed refs, pass a type parameter to `BMElement`:

```tsx
class MyForm extends BMElement<{ field: HTMLInputElement }> {
	protected override init() {
		this.refs.field.focus();
	}
}
```

### Lists :: `each()`

Renders a keyed list from a signal with efficient reconciliation. Only adds, removes, or patches the
items that changed.

```tsx
#items = this.signal<{ id: number; label: string }[]>([]);

override get template() {
  return (
    <ul>
      {this.each(
        this.#items,
        (item) => <li>{item.label}</li>,
        (item) => item.id,
      )}
    </ul>
  );
}
```

Arguments: `each(signal, renderFn, keyFn)`. The key function must return a stable `string | number`
identity for each item. The signal can hold an `Array` or a `Set`.

Item-level cleanup (from nested effects or `each` calls inside the render function) is tracked and
disposed automatically when an item is removed.

### Context :: DOM

Pass values down the element tree without prop drilling.

```tsx
// parent
protected override init() {
  this.provide("theme", "dark");
}

// descendant
protected override init() {
  const theme = this.inject("theme");       // ContextMap[K] | undefined
  const user = this.injectOrThrow("user");  // throws if no provider found
}
```

`inject` walks `parentElement` up to the root. `injectOrThrow` is the same but throws a descriptive
error instead of returning `undefined`. Keys are typed via the `ContextMap` interface - see the
[Context section](#context----bearmetal-appcontext).

### Shadow DOM

```tsx
protected override init() {
  this.useShadow();                    // attaches shadow root (mode "open" by default)
  this.adoptStyleSheet(myStyleSheet);  // add a CSSStyleSheet to the shadow root
}
```

`this.root` returns the shadow root when one exists, otherwise `this`.

---

## Standalone reactive utilities

Exported from `@bearmetal/app` for use outside of a component class body.

### `createEffect(fn)`

```ts
import { createEffect } from "@bearmetal/app";

createEffect(() => {
	console.log("value:", sig.get());
	return () => {/* cleanup */};
});
```

Must be called inside a `BMElement.init()` method or an `each()` render callback, otherwise cleanup
won't fire automatically and a warning is logged. The raw `effect(fn)` export skips the owner check
if you need it.

### `createSignal(init)`

Shorthand for `new Signal.State(init)` for use outside a class body.

```ts
import { createSignal } from "@bearmetal/app";

const count = createSignal(0);
count.set(1);
```

### `each(signal, renderFn, keyFn)` :: standalone

The same function available as `this.each` on `BMElement`. When called outside a component, item
cleanup won't be tracked automatically and a warning is logged. Use inside a component's `init()` or
a nested render callback whenever possible.

---

## Client routing

`<Router>` matches the current URL against its `<Route>` children and renders the winner. Everything
it shows is derived from the URL every time it renders — there is no activation state and no startup
handshake, so a page loaded (or reloaded) at a deep URL renders that route immediately.

```tsx
import { Link, Outlet, Route, Router, useParam } from "@bearmetal/app";

@define("my-app")
class App extends BMElement {
	protected override get template() {
		return (
			<div>
				<nav>
					<Link href="/" exact>Home</Link>
					<Link href="/settings">Settings</Link>
				</nav>
				<Router fallback={() => <p>Not found</p>}>
					<Route path="/">{() => <home-page />}</Route>
					<Route path="/users/:id">{({ param }) => <user-page userid={param("id")} />}</Route>
					<Route path="/settings" label="Settings">
						{() => (
							<settings-shell>
								<Outlet />
							</settings-shell>
						)}
						<Route path="/">{() => <settings-index />}</Route>
						<Route path="/profile">{() => <settings-profile />}</Route>
					</Route>
				</Router>
			</div>
		);
	}
}
```

### `<Route>`

Declares one route. It renders nothing itself — it returns a descriptor that the enclosing `Router`
collects, so the whole route tree is known statically before anything is matched.

`path` is a [`URLPattern`](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern) pathname
relative to the enclosing route: `:name` captures a segment, `*` matches the rest. It defaults to
`/`.

Route content goes in a **function**, not an element — that is what makes it render only when
matched, and re-render when the match changes. Anything else passed as a child is dropped with a
warning.

A route with nested `<Route>` children acts as a layout. Give it a renderer containing an `<Outlet>`
to wrap them, or leave the renderer off to use it as a bare path prefix. Children are matched before
the parent's own path, so a `path="/"` child is the index route for its parent.

Any other prop (`label`, `icon`, `hidden`, whatever you invent) is carried on the descriptor's
`meta` and never affects matching — see [`useRoutes()`](#useroutes).

### `<Router>`

| Prop             | Description                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `base`           | Path every route is mounted under. Defaults to `/`.                                              |
| `url`            | Match this URL instead of the live location. Server-side, defaults to the one the render is for. |
| `fallback`       | Rendered when no route matches.                                                                  |
| `interceptLinks` | Route same-origin `<a>` clicks through the router. Defaults to `true`.                           |

Routes are matched in declaration order — first match wins, not most specific. A matched route's
renderer runs again only when the _route_ changes: navigating `/users/1` → `/users/2` keeps the
rendered tree and updates `useParams()` instead of rebuilding it.

Server-side there is no `location` to read. `Page()` supplies the request URL to the render, and a
`<Router>` anywhere inside it — including one several levels down in a component's `template` —
picks that up with no plumbing:

```tsx
router.route("/app/*").get(Page(() => <Router>{/* … */}</Router>));
```

That works because a render is synchronous: the URL is scoped to its call stack, so concurrent
requests cannot see each other's. Pass `url` explicitly to pin a router to a fixed URL anyway, or
when driving the renderer yourself:

```ts
await renderToString(() => <Router>{/* … */}</Router>, { url: ctx.request.url });
```

**With no URL from either source, a server render produces nothing** (and warns). That is
deliberate: guessing `/` would emit the wrong route's markup on every other path, which the client
then has to tear out and replace on hydration — a visible flash of the wrong page, plus a full
mount/unmount cycle for components that should never have rendered. Rendering nothing leaves the
client to fill the slot in with the right route on mount.

### `<Outlet>`

Renders the matched child route inside its parent's layout. In an `async` route renderer, call it
before the first `await` — the frame it reads is a synchronous call-stack variable.

### `<Link>`

An anchor that navigates through the router instead of reloading. It renders a real `href`, so
middle-click, "open in new tab" and crawlers behave normally, and a cross-origin `href` is left
entirely alone.

While it points at the current location it carries `data-active` and `aria-current="page"`:

```css
a[data-active] {
	font-weight: 600;
}
```

By default a link is active for its section too (`/settings` is active on `/settings/profile`); pass
`exact` to require the whole path. The root (`/`) always requires an exact match. `replace` swaps
the current history entry instead of pushing a new one.

### `navigate(to, options?)`

Navigates imperatively, resolving `to` against the current URL. `{ replace, state }` map onto
`history.replaceState`/`pushState`.

```ts
import { navigate } from "@bearmetal/app";

navigate("/users/42");
navigate("?tab=settings", { replace: true });
```

`pushState`/`replaceState` are patched once, so imperative navigation from anywhere in the app —
including code that never heard of this router — still updates what is rendered.

### Params

A route's render function receives a `RouteContext`. **This is the reliable way to reach params**,
and the only one that works when the route renders a custom element:

| Field         | Description                                            |
| ------------- | ------------------------------------------------------ |
| `param(name)` | One reactive param, ready to hand to a child as a prop |
| `params`      | All params, merged across the matched chain            |
| `match`       | The router's live match                                |
| `url`         | The URL as it stood when this route rendered           |

```tsx
<Route path="/users/:id">{({ param }) => <user-page userid={param("id")} />}</Route>;
```

Params are reactive, which is what lets a params-only navigation (`/users/1` → `/users/2`) update
the page in place instead of rebuilding it. Passing `param("id")` straight into a `@prop` binds both
sides to the same signal, so the child re-renders on its own with no attribute round-trip.

::: warning A custom element cannot use the hooks `useParams()` and friends read the frame of the
route that is _currently rendering_. A component's `init()` runs when its element enters the
document — long after the renderer returned — so inside a custom element they are always empty (and
say so). Take what you need from the render function's `RouteContext` and pass it down as a prop.
:::

### Hooks

For plain function components, called synchronously during a route's render (and before any
`await`):

| Hook              | Returns                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| `useParams()`     | `Signal.Computed<Record<string, string>>`, merged across the whole chain |
| `useParam(name)`  | `Signal.Computed<string \| undefined>`                                   |
| `useRouteMatch()` | `Signal.Computed<RouteMatch \| null>`                                    |
| `useRoutes()`     | Every chain the router can match, in match order                         |

```tsx
function UserPage() {
	const id = useParam("id");
	return <h1>User {id}</h1>;
}
```

`useRoutes()` returns the flattened route tree — enough to build a nav, breadcrumbs or a sitemap
without rendering anything, with each route's `meta` along for the ride.

---

## Signals :: `@bearmetal/app/signals`

A pinned build of the TC39 Signals proposal polyfill (v0.2.2).

```ts
import { Signal } from "@bearmetal/app/signals";
```

### `Signal.State<T>`

Writable signal. Notifies dependents synchronously when `.set()` is called with a value that doesn't
pass the equality check.

```ts
const s = new Signal.State(0);
s.get(); // 0
s.set(1); // dependents are notified
```

### `Signal.Computed<T>`

Derived, read-only signal. The computation runs lazily when `.get()` is called inside a reactive
context; dependencies are tracked automatically.

```ts
const double = new Signal.Computed(() => s.get() * 2);
double.get(); // 2
```

### Options

Both constructors accept an optional second argument:

```ts
const s = new Signal.State({ x: 1 }, {
	equals: (a, b) => a.x === b.x,
});
```

| Option                      | Description                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `equals(a, b)`              | Custom equality check. Return `true` to suppress propagation. Defaults to `Object.is`. |
| `[Signal.subtle.watched]`   | Called when the signal gains its first live watcher.                                   |
| `[Signal.subtle.unwatched]` | Called when the signal loses all watchers.                                             |

### `Signal.subtle.untrack(fn)`

Read signals inside `fn` without registering them as dependencies:

```ts
const snapshot = Signal.subtle.untrack(() => s.get());
```

---

## Context :: `@bearmetal/app/context`

Two systems are exported from the same module: **stack context** (call-stack scoped, SSR-friendly)
and **DOM context** (walks the element tree at runtime). Both are typed through the same
`ContextMap` interface.

### Extending `ContextMap`

Use declaration merging to add typed keys:

```ts
declare module "@bearmetal/app/context" {
	interface ContextMap {
		theme: "light" | "dark";
		user: { id: string; name: string };
	}
}
```

All context functions will then be typed for `"theme"` and `"user"`.

### Stack context

Scoped to the synchronous call stack. Values are visible only within the function passed to
`withContext`. Suitable for SSR request handling where per-request data shouldn't leak across
requests.

```ts
import {
	ctx,
	getContextItem,
	getContextItemOrDefault,
	setContextItem,
	setDefaultContext,
	withContext,
} from "@bearmetal/app/context";

withContext({ theme: "dark" }, () => {
	const theme = getContextItem("theme"); // "dark"
	setContextItem("theme", "light"); // writes into the current frame
});

setDefaultContext({ theme: "light" }); // populates the base frame
```

| Function                                 | Description                                                 |
| ---------------------------------------- | ----------------------------------------------------------- |
| `withContext(context, fn)`               | Run `fn` with `context` pushed onto the stack               |
| `ctx`                                    | Proxy, reads the topmost value for a key, throws if missing |
| `getContextItem(key)`                    | Read a key from the stack (throws if missing)               |
| `getContextItemOrDefault(key, fallback)` | Read a key or return `fallback`                             |
| `setContextItem(key, value)`             | Write into the current stack frame                          |
| `setDefaultContext(context)`             | Populate the base frame (app-wide defaults)                 |

### DOM context

Walks `parentElement` up the tree. The primary interface is through `BMElement.provide` /
`BMElement.inject`, but the functions can also be called directly with any element.

```ts
import { inject, injectOrThrow, provide } from "@bearmetal/app/context";

provide(el, "theme", "dark");
inject(el, "theme"); // ContextMap["theme"] | undefined
injectOrThrow(el, "theme"); // ContextMap["theme"] or throws
```

---

## SSR :: `@bearmetal/app/ssr`

Middleware factories for rendering pages on the server. Designed to work with `@bearmetal/router`.

```ts
import { Layout, Page } from "@bearmetal/app/ssr";
```

### `Layout(jsx)`

Sets a layout component on `ctx.state.layout` and calls `next()`. Any `Page` handler on the same
route chain will wrap its output in this layout.

```tsx
router.use(Layout(({ children }) => (
	<html>
		<head>
			<title>My App</title>
		</head>
		<body>{children}</body>
	</html>
)));
```

### `Page(render)`

A terminal route handler that:

1. Calls `render(ctx)` to get the page JSX
2. Wraps it in the layout from `ctx.state.layout` (if any)
3. Scans the resulting HTML for custom element tag names
4. Finds each component's module URL via the registry populated by `@define(..., import.meta)`
5. Bundles all used component modules into a single `<script type="module">` tag
6. Inserts the bundle immediately after `<body>`

```tsx
router.route("/dashboard").get(
	Page((ctx) => <dashboard-page user={ctx.state.user} />),
);
```

Components must be decorated with `@define("tag", import.meta)` to appear in the bundle. Components
without `import.meta` are silently skipped.

### Types

```ts
type LayoutEl = (props: { children: JSX.Element }) => JSX.Element;
type LayoutState = { layout?: LayoutEl };
```

Use `LayoutState` when typing router state in handlers that need access to the layout:

```ts
type AppState = LayoutState & { user: User };

router.use<AppState>(async (ctx, next) => {
	ctx.state.user = await getUser(ctx);
	return next();
});
```
