---
prev:
  text: "Props"
  link: "/getting-started/components/props"
next:
  text: "Loading data"
  link: "./data-loading"
---

# Server-Side Rendering

A component renders on the server as itself: the same class, the same `template`, the same JSX
runtime. There is no server-only counterpart to write and none to keep in agreement with the browser
one.

That works because the runtime never builds strings. It builds DOM nodes, always, with
`document.createElement`. On a server that `document` is
[`@bearmetal/slag`](https://jsr.io/@bearmetal/slag), a microdom whose trees serialize themselves. A
page is rendered by making one, letting it settle, and asking it for its markup.

```tsx
@define("hello-there")
export class HelloThere extends BMElement {
	override get template() {
		return <p>Hello</p>;
	}
}
```

```html
<hello-there>
	<p>Hello</p>
</hello-there>
```

## A page, end to end

Two pieces of router middleware. `Layout()` puts a shell in the request state; `Page()` renders a
view inside it and returns the response.

```tsx
// views/layouts/page.tsx
import { Layout } from "@bearmetal/app/ssr";

export const page = Layout((props) => (
	<html lang="en">
		<head>
			<meta charset="UTF-8" />
			<meta
				name="viewport"
				content="width=device-width, initial-scale=1.0"
			/>
			<title>{props.title}</title>
		</head>
		<body>{props.children}</body>
	</html>
));
```

```tsx
// main.ts
import { Router } from "@bearmetal/router";
import { Page } from "@bearmetal/app/ssr";
import { page } from "@views/layouts/page.tsx";

const router = new Router();

router.use(page); // every route below this inherits the layout

router.route("/").get(Page(() => <hello-there />, "Home"));

Deno.serve(router.handle);
```

A layout receives `{ children, title, theme?, description? }`. `Page()` supplies the first two with
its second argument as the title, defaulting to `"BearMetal SSR"`. The other two are part of the
type for layouts that render them, so give them fallbacks:

```tsx
<meta name="description" content={props.description ?? "…"} />;
```

Any `Page` on a route chain that has passed through a `Layout` is wrapped in it. A `Page` without
one renders the view on its own and serializes it as a fragment with no `<!DOCTYPE>` nor bundle
since there is no `<head>` to put one in.

## What a render does, in order

1. **Render.** The view is built synchronously, top to bottom. Components connect and their
   `template`s run exactly as they would in a browser.
2. **Collect.** A component with a [`serverInit()`](./data-loading) starts it as it connects and
   hands the promise to the render rather than blocking on it, so the whole page's I/O overlaps.
   Promise children are collected the same way.
3. **Settle.** The renderer awaits that batch, flushes the effects the resolved values dirtied, and
   goes round again while that produces more work, such as a component revealed by another
   component's load gets its own turn.
4. **Snapshot and serialize.** Every [`@state`](./data-loading#state) signal is written into its
   element's markup, and the tree becomes a string.

Rendering being synchronous is what makes step 1 safe: nothing can interleave with it, so two
requests in flight cannot see each other's tree or each other's URL, even though they share one
process-wide `document`. It is also why the per-render URL can live in call-stack context, which is
what lets a [`<Router>`](/app#client-routing) match on the server with nothing threaded down to it.

:::info Effect scheduling Effects are flushed by the renderer, not by the microtask queue. In a
browser, writing a signal schedules an effect pass for the next microtask; during a server render
the renderer runs that pass itself, inside the render's scope, and keeps going until the graph stops
moving. Markup is only handed back once it has. :::

## What ships to the browser

One bundle, built once, for the whole app — every component in
[`@components`](../components/component-directory), not the ones this page happened to use.
`createStack()` builds it at startup and puts two tags in every page's `<head>`:

```html
<link rel="stylesheet" href="/@bearmetal/components/index.css?v=…" />
<script type="module" src="/@bearmetal/components/index?v=…"></script>
```

Referenced rather than inlined, so the browser fetches them once and reuses them for every page
after; the `?v=` is a hash of the contents, which is what makes it safe to cache them forever.

::: info Why not just the page's components?

Because the page is not where it ends. A bundle assembled from the tags one page rendered is missing
everything the _next_ page needs, and a client-side [`<Router>`](/app#client-routing) navigating to
that page finds nothing to upgrade with. It only ever worked for apps that reload on every link.

:::

Component stylesheets do not come from the bundle. They are collected on the server as each
component's module is imported, with `:scope` rewritten to the tag, and served as that one
stylesheet — so the first paint is styled without waiting for any JavaScript.

### What does not ship

`serverInit` and `stylesheet` bodies are removed from every component _before_ the bundler reads it,
not from the bundle afterwards. The difference is the dependency tree:

```ts
import { db } from "../db.ts"; // only used by serverInit
```

Emptying the body in the finished bundle deletes the body and nothing else — the graph was walked
long before, so `db.ts` and everything behind it is already in the file. Stripping first is what
makes the import unused, and an unused import is one the bundler can drop.

The components directory is mirrored into a temporary copy with the bodies gone, and the bundler is
pointed at the copy; the server goes on importing the originals, because it needs the halves the
browser must not have. Anything the copy cannot reach — a component pulled in from another package,
or through an import-map alias — is still stripped, just from the output, so its body never ships
even though its imports do.

::: tip Guarantee it

For a dependency that must never reach the browser under any circumstances, import it inside
`serverInit()` rather than at the top of the file:

```ts
override async serverInit() {
	const { db } = await import("../db.ts");
	this.rows.set(await db.rows());
}
```

The import goes with the body, so there is nothing left for the bundler to find at all.

:::

Nothing else about a component is server-only, so nothing else is removed.

## Then the browser picks it up

When the bundle lands, each element upgrades. `connectedCallback` reads back any `@state` the server
left in the markup into the same signals before the first client render. The component starts from
where the server finished rather than fetching it again.

That handoff, and the loading that feeds it, is the next page.
