---
site:
  name: Bramble
  repository: https://example.com/bramble
  editBase: https://example.com/bramble/edit/main/docs/
  sourceBase: https://example.com/bramble/blob/main/
name: Bramble
text: Small reactive pieces for the web
tagline: Signals, components and a router in under 9 kB. No virtual DOM, no build step required.
badge: v0.9.2 · beta
primary:
  label: Get started
  href: guides/0000-[rocket]-start-here/0000-getting-started.md
secondary:
  label: Read the reactivity guide
  href: packages/core/0.9/0000-[book-open]-learn/0000-reactivity.md
---

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

::: features
- lightning | Fine-grained updates | Only the text node that read a signal changes. Nothing else re-runs.
- tree-structure | Ownership built in | Effects are disposed with the component that created them, so leaks are opt-in.
- path | A router that types itself | Route params and loaders are inferred from the path string.
- terminal-window | One CLI | Scaffold, serve, test and build with a single `bramble` command.
:::
