---
description: Install Bramble, scaffold a project and render your first component.
status: stable
updated: Oct 3, 2026
---

# Getting started

Bramble runs anywhere modern JavaScript does. You need Deno 2 or Node 20 and a terminal.

::: steps
### Install the package
::: code-group
```sh [deno]
deno add jsr:@bramble/core
```
```sh [npm]
npm install @bramble/core
```
```sh [pnpm]
pnpm add @bramble/core
```
:::
### Write a component
Components are plain functions that return JSX. Any [[signal]] they read becomes a live binding.
```tsx [app.tsx]
import { signal, mount } from "@bramble/core";

function Counter() {
  const count = signal(0);
  return <button onClick={() => count.update((n) => n + 1)}>{count}</button>;
}

mount(Counter, document.getElementById("app"));
```
### Start the dev server
```sh
npx bramble dev
```
Open the printed URL. Edits reload without losing signal state.
:::

::: tip Prefer a template?
`npx create-bramble my-app` scaffolds the same project with a router and tests already wired up.
:::

## Project layout

```txt
my-app/
  app.tsx          # entry
  routes/          # one file per route
  bramble.config.ts
```

| File | Purpose |
| --- | --- |
| `app.tsx` | Mounts the root component |
| `routes/` | File-based routes, picked up by `@bramble/router` |
| `bramble.config.ts` | Dev server and build options |

## Next steps

- Learn how updates flow in [Reactivity](../../packages/core/0.9/0000-[book-open]-learn/0000-reactivity.md).
- Look up every option on [signal()](../../packages/core/0.9/0016-[brackets-curly]-reference/0000-signal.md).
- See what changed recently in the [Changelog](/changelog).
