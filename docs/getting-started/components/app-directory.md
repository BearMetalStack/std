---
next:
  text: "Templates"
  link: "./templates"
prev:
  text: "@components"
  link: "./component-directory"
---

# `@app` and `@pages`

Alongside [`@components`](./component-directory), two more directories feed the same one client
bundle, each with a distinct job. Neither is `@bearmetal/app` the package — the alias is a project
convention, the JSR package a dependency; they share a name on purpose, not by accident.

## `@app` — shared modules

`@app` (`app/` or `src/app/`) holds anything a component or a `@pages` file needs to import — most
often a store: a signal (or a small group of them) created once, at module scope, and shared by
whoever imports it.

```ts
// @app/stores/users.ts
import { createSignal } from "@bearmetal/app";

export interface UserProfile {
	id: string;
	name: string;
}

const profile = createSignal<UserProfile | null>(null);

export const usersStore = {
	profile,
	load(id: string) {
		profile.set({ id, name: `User ${id}` });
	},
};
```

A file here is a plain ES module — no manifest, no route-scoping, nothing special about the import.
A component reads it exactly like any other import:

```tsx
// @components/users/profile.tsx
import { BMElement, define } from "@bearmetal/app";
import { usersStore } from "@app/stores/users.ts";

@define("user-profile")
export class UserProfile extends BMElement {
	get template() {
		return this.computed(() => {
			const profile = usersStore.profile.get();
			return profile ? `User: ${profile.name}` : "Loading…";
		});
	}
}
```

Every file under `@app` is included in the bundle unconditionally, whether or not anything imports
it yet — so a store can exist ahead of its first consumer without being dropped as dead code.

## `@pages` — per-route client orchestration

`@pages` (`pages/` or `src/pages/`) holds one file per route: client-side setup that should run when
that specific route's page loads — most often, populating a store from the URL.

```ts
// @pages/users/_id.ts
import { registerPage } from "@bearmetal/app";
import { usersStore } from "@app/stores/users.ts";

registerPage("users/_id", () => {
	const id = location.pathname.split("/").pop() ?? "";
	usersStore.load(id);
});
```

The filename is the route's last segment, named the same way `@components` manifests are: a dynamic
`:id` becomes `_id` — the convention the `bearmetal generate route` scaffolder also uses for
filenames — and `main.ts` is the fallback a route resolves to when it has nothing more specific:

```
@pages/
  main.ts            # fallback for any route with nothing more specific
  users/
    main.ts          # fallback for /users/* routes
    _id.ts           # /users/:id specifically
```

Resolution walks the same way `@components` manifests do — `/users/:id` tries `users/_id`, then
`users/main`, then `main` — but here it has a real effect: the server picks the winning candidate
for the route currently rendering and embeds it as `<meta name="bm-page" content="users/_id">`.
Every `@pages` file's `registerPage(key, fn)` call runs unconditionally as part of loading the one
bundle (the same reason `@app` files ship unconditionally — nothing else naturally imports a
`@pages` file), so by the time the bundle's own `dispatch()` call runs — its last statement — every
registration already exists, and dispatch is a plain lookup by the key the server already resolved.

### Why this isn't `<script src>` per route

An earlier design gave each `@pages` file its own bundle entrypoint and script tag. That broke the
moment a component needed to import a shared store: a store either had to live inside one specific
route's file (not shared) or get duplicated across per-route bundles (not one canonical instance).
Making `@pages` files plain, unconditionally-bundled modules that self-register — instead of
separately-shipped entrypoints — is what lets `@app` be simple, ordinary imports.

The trade-off: a client-side `<Router>` navigating from one page to another does **not** re-run the
new route's `@pages` dispatch — the `<meta>` tag and the `dispatch()` call only happen once, at
initial page load. Only a full page load re-resolves and re-dispatches. If a route needs its
orchestration to re-run on client-side navigation too, that has to be wired up explicitly (e.g. the
`<Router>`'s own navigation hook), not assumed from `@pages` alone.
