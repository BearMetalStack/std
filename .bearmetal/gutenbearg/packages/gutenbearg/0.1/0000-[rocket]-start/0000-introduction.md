---
description: Documentation sites from a directory of markdown, where the file system is the only manifest.
---

# Introduction

Gutenbearg turns a directory of markdown into a documentation site. You never write a nav file,
an ordering file or a build manifest. File names set the order, directory names give the icons,
and frontmatter covers the rest.

::: features
- folder-open | The file system is the manifest | Number prefixes order pages, `[icon]` names give sections their icons, and links point at files.
- clock-counter-clockwise | Versions that inherit | A version directory holds only the pages that changed. Everything else carries forward.
- link | Linked to your code | Each docs package is matched to a package in your Deno workspace, so the tools know its current version.
- layout | Three shells | Choose `trail`, `shelves` or `den`, or render the docs inside your own app's layout.
- terminal-window | Tools that do the numbering | `new`, `edit`, `reindex`, `cut` and `changelog` handle file names so you don't have to.
- package | Serve or build | Serve it as a router module with live reload, or build a static site through diecast.
:::

## How it fits together

```diagram
markdown -[clawmark]-> content tree -[blocks]-> page -[shell]-> site
```

`loadContent()` reads the directory and builds a route for every page. Markdown is parsed by
`@bearmetal/clawmark` with its docs rules, and each piece is drawn with gutenbearg's blocks. The
module serves those routes, and `build()` writes the same routes out as static files.

## Next

- [Quick start](0016-quick-start.md) gets a site running.
- [Layout](../0016-[folder-open]-content/0000-layout.md) shows what goes where.
