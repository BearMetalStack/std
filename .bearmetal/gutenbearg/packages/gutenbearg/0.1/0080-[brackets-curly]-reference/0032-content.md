---
description: loadContent(), the content model, and the helpers for working with names and versions.
---

# Content API

```signature [gutenbearg/content/load.ts]
function loadContent(dir?: string, options?: LoadOptions): Promise<SiteContent>
```

This reads the directory once. Content mistakes become `diagnostics` rather than exceptions; only
I/O failures throw. For repeated loads, keep a `ContentLoader`, which re-parses only the files
whose modification time has changed.

`SiteContent` holds `site`, `home`, `guides`, `packages`, `glossary`, `releases`, `diagnostics`,
`icons`, and `routes`, a map from each URL (without its leading slash) to the page, changelog or
home it serves.

Each `PackageInfo` lists its `versions` newest first. If it was linked to the workspace, it also
has a `source` holding the package's `name`, `version` and `dir`.

## Workspace

| Function | Description |
| --- | --- |
| `findWorkspace(from)` | The nearest Deno workspace above a directory, with its members. |
| `linkPackage(ws, id, override?)` | The member a docs package documents. |
| `docsVersion(version, scheme)` | `0.3.2` → `0.3` with `minor`. |

## Names

| Function | Description |
| --- | --- |
| `parseName(name)` | `{ order, numbered, icon, slug }` from `0016-[rocket]-start`. |
| `formatName(order, slug, { icon, ext })` | The reverse. |
| `between(a, b)` | The halfway number, or `null` if there's no room. |
| `respace(n, step)` | `0, 16, 32, …` |

## Editing

`newPage`, `newSection`, `copyForward`, `reindex`, `cutVersion` and `draftChangelog` are what the
CLI calls. Each one throws `ContentEditError`, with a message saying what to do instead.
