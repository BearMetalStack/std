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
gutenbearg reindex guides/start-here [--sections] [--dry-run]
gutenbearg cut core 1.0                          # a new (empty, inheriting) version
gutenbearg build --out=dist [--strict]           # static site via diecast
```

All of these run as `deno run -A jsr:@bearmetal/gutenbearg/cli …`, take `--dir`, and accept paths
written in slugs.

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

## Example

`deno task example` serves `examples/bramble`. Add `?layout=shelves` or `?layout=den` to switch
shells.
