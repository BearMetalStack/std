# @bearmetal/gutenbearg

Documentation sites for BearMetal, written in markdown, where **the file system is the only
manifest**. There's no nav file and no ordering file, and building a static site needs no diecast
manifest.

## Content

```
.bearmetal/gutenbearg/
  index.md                                   home: hero frontmatter, `site:` settings, body
  glossary/<term>.md                         `term`, `see`; the body is the definition
  guides/0000-[rocket]-start-here/
    0000-getting-started.md                  → /guides/start-here/getting-started
  packages/core/
    index.md                                 `name`, `status`, `description`
    0.8/0000-[book-open]-learn/0000-reactivity.md
    0.9/0016-[brackets-curly]-reference/0000-signal.md
                                             → /core/reference/signal (latest)
                                             → /core/v0.8/… (older versions)
    changelog/0.9.2.md                       `date`; a list of `added: …` items
```

- **Order** comes from the number prefix, which never reaches a URL. New entries go 16 after the
  last one. An entry inserted between two others takes half the gap, so nothing gets renamed until
  `reindex` respaces a directory.
- **Icons** come from `[name]` in a section's directory name (any Phosphor icon). A section's
  `index.md` can override its title, icon and description.
- **Versions inherit.** A version directory holds only the pages that changed. Anything missing is
  carried forward from older versions, and `removed: true` drops a page from that version on. A
  package with sections directly under it is unversioned.
- **Links point at files.** Write `[signal](../0016-reference/0000-signal.md)`. Gutenbearg matches
  it by slug, so renumbering doesn't break it, and a link into your own package follows the version
  being read. Dead links are reported.
- **Titles** come from frontmatter `title`, then a leading `# heading` (which is lifted out of the
  body), then the slug.
- `draft: true` renders a page as "still hibernating", in its place in the navigation.

Markdown is parsed by `@bearmetal/clawmark` with its docs rules. Fenced code takes `lang [label]`.
There are `::: tip|info|warning|danger|steps|code-group|features` containers, `[[term]]` glossary
links, `<Badge type="warn" text="…"/>`, and the `` ```signature [path] `` and `` ```diagram ``
(`a -[label]-> b`) fences.

## CLI

```sh
gutenbearg dev                                   # serve, reloading on change
gutenbearg check                                 # dead links, duplicate slugs, bad frontmatter…
gutenbearg new page guides/start-here/deploying --after=getting-started
gutenbearg new section packages/core/0.9/advanced --icon=gear
gutenbearg new page core/learn/batching          # core's current version, from its deno.json
gutenbearg edit core/reference/signal            # copy a page forward into the current version
gutenbearg changelog core [--version=X] [--force]  # draft an entry from conventional commits
gutenbearg reindex guides/start-here [--sections] [--dry-run]
gutenbearg cut core 1.0                          # a new (empty, inheriting) version
gutenbearg build --out=dist [--strict]           # static site via diecast
```

All of these run as `deno run -A jsr:@bearmetal/gutenbearg/cli …`, take `--dir`, and accept paths
written in slugs.

**Packages link to code.** `packages/<id>/` is matched to a member of the surrounding Deno
workspace: by `package:` in its `index.md`, else a member named `…/<id>`, else one in a directory
called `<id>`. The link names the package and gives it a current version. Its docs version is the
major.minor of that version unless `site.versioning` says `major` or `exact`. A path that starts
with a package id (`core/learn/batching`) means that version. `edit` copies the newest older copy of
a page into it under the same names, so you only ever change the current version.
`site.workspace: false` turns linking off, for docs about code that lives elsewhere.

`changelog` reads the commits since the package's last `<name>@<version>` tag and keeps those scoped
to it: `feat` → added, `fix` → fixed, `refactor`/`perf` → changed, and `!` or a `BREAKING CHANGE`
footer → breaking. It writes them oldest first, ready to edit.

## Shells

Every page renders in one of three shells: **trail** (sibling-menu breadcrumbs, the section as
stations, a page map), **shelves** (sections as filterable shelves, a package switcher, a TOC that
fills as you read) or **den** (recently read pages, Up next, a paw-print trail). Set the default
with `site.layout`, or per request with `resolve`.

## In an app

```ts
import { Router } from "@bearmetal/router";
import { gutenbeargModule } from "@bearmetal/gutenbearg";

const router = new Router();
router.use(await gutenbeargModule({ watch: true }));
Deno.serve(router.handle);
```

The module serves its stylesheet, client script, per-site icon sprite and logos at
`/@bearmetal/gutenbearg/*`. The client is bundled with `Deno.bundle` on first request, so the app
needs `--unstable-bundle`.

## Inside an app

The docs can also live inside an app's own pages, with its header and theme around them. Mount the
module after the app's `Layout()` from `@bearmetal/app/ssr` and pick a frame:

```ts
router.use(Layout(AppLayout));
router.use(await gutenbeargModule({ base: "/docs", frame: "shell" }));
```

- `document` (the default) serves whole HTML documents, as above.
- `shell` keeps the sidebar and right rail. A bar with the areas, search and version menu stands in
  for gutenbearg's header.
- `article` is the page alone.

Pages render through `Page()`, so they get the app's `<html>`, and the stylesheet is added to its
`<head>` on routes under `base`. `resolve` can return a `frame` per request too. If no `Layout()`
ran, gutenbearg warns once and serves whole documents.

The app supplies drip (`BMDripBase`) and the theme: embedded docs follow its `data-theme`, and
`site.theme` is ignored. If the app's header is sticky, set `--gb-host-offset` to its height so the
docs bar and sidebars stick below it.

To route the pages yourself, pass `routes: false`. The module then serves only its assets, and
`render(route, { frame })` returns `{ status, title, description, view }` to place in any page. That
view carries its own stylesheet link.

## Example

`deno task example` serves `examples/bramble`. Add `?layout=shelves` or `?layout=den` to switch
shells. `examples/embedded` serves the same docs at `/docs` inside an app's layout; add
`?frame=article` to drop the sidebars.
