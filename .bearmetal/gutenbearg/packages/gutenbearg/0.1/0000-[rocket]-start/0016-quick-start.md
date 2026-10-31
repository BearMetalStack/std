---
description: A content directory, a dev server and a static build in a few minutes.
---

# Quick start

::: steps
### Make the content directory
Gutenbearg reads `.bearmetal/gutenbearg/` by default. Every command takes `--dir` to point it
somewhere else.
```md [.bearmetal/gutenbearg/index.md]
---
site:
  name: My docs
name: My docs
tagline: Everything about my packages.
---
```
### Add a section and a page
The CLI chooses the numbers for you. A path that starts with a package id writes into that
package's current version.
```sh
deno run -A jsr:@bearmetal/gutenbearg/cli new section guides/start --icon=rocket
deno run -A jsr:@bearmetal/gutenbearg/cli new page guides/start/hello
```
### Serve it
```sh
deno run -A jsr:@bearmetal/gutenbearg/cli dev --port=8000
```
Edits reload without a restart, and so do new files.
### Build it
```sh
deno run -A jsr:@bearmetal/gutenbearg/cli build --out=dist --strict
```
`--strict` refuses to build while `check` still reports problems.
:::

::: tip Inside an existing app
Mount `await gutenbeargModule()` on your router instead of running `dev`. [Embedding](../0048-[layout]-presentation/0016-embedding.md)
covers putting the docs inside your app's own layout.
:::
