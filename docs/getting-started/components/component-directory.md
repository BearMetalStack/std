---
next:
  text: "@app / @pages"
  link: "./app-directory"
prev:
  text: "Components"
  link: "./index"
---

# `@components`

The `/components` directory (also referred to as `@components`) contains all components that you
wish to be permanently available on the client. By default, all components within this directory
will be served as a single bundle to the client. This enables you to use the compliant names set by
`@define` for any of these components without worrying about needing to import them and having them
get missed in the bundle.

Since there is no discrimination or code-splitting around these, you should be mindful about what is
actually being included here.

The directory is found at either `components/` or `src/components/`, relative to where you start
your server. The default bundle is served from `/@bearmetal/components/index` and its script tag is
injected into every HTML response, so you never need to reference it yourself. Every component's
`static stylesheet` is served next to it as `/@bearmetal/components/index.css`, linked from the same
place.

Both URLs carry a `?v=` hash of their contents, so they are served `immutable` and fetched once.

## Views name components, they do not import them

A view is server-only: it renders once, per request, and never runs again in the browser. So a view
that imports a component class gets the component _rendered_ but not _shipped_ — the module is not
in the bundle unless it is in this directory.

```tsx
// views/home.tsx
export const home = Page(() => <app-main />); // ✓ registered by @components, bundled
```

```tsx
// ✗ renders on the server, then does nothing in the browser
import { App } from "../components/main.tsx";
export const home = Page(() => <App />);
```

Naming the tag is the whole point of the directory: the component is registered before the first
request, so the tag resolves, and it is in the bundle, so it upgrades.

## `main.manifest.ts` files, and resolving per route

Inside `@components`, you can optionally provide `main.manifest.ts` files to name which components a
part of your app needs, instead of letting every component in the directory glob into the bundle.
This is useful if you have a large number of components and only want to name a specific set, or if
you wish to import components from external libraries or from `@bearmetal/webbies`.

```ts
// @components/main.manifest.ts - the root fallback, always included
import "./component-a.ts";
import "./component-b.ts";
import "@bearmetal/webbies/markdown"; // Only include the Webbies markdown components
```

The moment any `main.manifest.ts` (or nested `<segment>.manifest.ts`, below) exists anywhere under
`@components`, the whole-directory glob stops applying — with none at all, every component in the
directory still ships, unchanged.

### Per-route manifests

A manifest can also be nested to name components a specific route needs, on top of whatever the
nearest enclosing `main.manifest.ts` already ships. The file is named after the route's last
segment, using the same `:id` → `_id` convention as the `bearmetal generate route` scaffolder:

```ts
// @components/users/_id.manifest.ts - additive, for /users/:id
import "./profile.tsx";
```

```
@components/
  main.manifest.ts        # fallback for any route with nothing more specific
  users/
    main.manifest.ts      # fallback for /users/* routes
    _id.manifest.ts       # /users/:id specifically
```

Resolution walks from the matched route's most specific candidate up to the nearest
`main.manifest.ts` (`/users/:id` tries `users/_id`, then `users/main`, then `main`) — but this is
**diagnostic only**: every manifest found anywhere is unioned into the one bundle regardless of
route, because
[a client-side `<Router>` navigating to an unvisited page still needs its components
already shipped](../ssr/#what-ships-to-the-browser). What the resolution actually decides is purely
informational (and, in dev, whether to warn that a route has no manifest resolving to it at all) —
it never changes what ships. For that, see [`@pages`](./app-directory), which resolves the same way
but _does_ have a real per-route effect.

There is no longer a way to build an arbitrary, unrelated named bundle (the old flat `manifest.ts` /
`<subset>.manifest.ts` system) — every manifest is now either `main.manifest.ts` or scoped to a
route segment.
