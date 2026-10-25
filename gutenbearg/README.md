# @bearmetal/gutenbearg

Documentation sites for BearMetal. Page templates, content blocks and the reading chrome around
them, served from the router.

> **Status: templates only.** Content is hand-composed from blocks for now. Reading frontmatter and
> markdown (via `@bearmetal/clawmark`) and static output (via `@bearmetal/diecast`) are the next
> pass; the data model in `types.ts` is shaped for them.

## Pages

| Template            | Route                           | What it is                                           |
| ------------------- | ------------------------------- | ---------------------------------------------------- |
| `HomeTemplate`      | `/`                             | Hero, body blocks (install, features), package tiles |
| `DocTemplate`       | any written nav page            | Guide or reference page                              |
| `ChangelogTemplate` | a page with `kind: "changelog"` | Release timeline, filterable by type and package     |
| `NotFoundTemplate`  | in the nav but unwritten        | "Still hibernating" draft, with nearby pages         |
|                     | anything else                   | 404, with nearby pages                               |

Each renders inside one of three shells (`SiteConfig.layout`, or per request):

- **trail**: breadcrumbs that are menus of siblings, the section as a line of stations with read
  pages checked, and a clickable page map with time left.
- **shelves**: navigation by intent, a package switcher that scopes the sidebar, a live filter, and
  a TOC that fills as each section is read.
- **den**: recently read pages, an Up next card that skips what you've read, and a paw-print trail.

## Blocks

`H2`/`H3`, `Callout` (`tip`/`info`/`warning`/`danger`), `Steps`/`Step`, `Code`, `CodeGroup`,
`Signature`, `Diagram` (`A -[label]-> B`), `Table`, `Features`, `Term`, `Badge`, `Icon`. Each is the
target one markdown construct will render to. Plain `<p>`, `<ul>`, `<ol>` and `<code>` are styled as
they are.

Headings, reading time and the glossary terms a page uses are measured from the rendered body, so
the outline can't drift from the content.

## Use

```ts
import { Router } from "@bearmetal/router";
import { gutenbeargModule } from "@bearmetal/gutenbearg";

const router = new Router();
router.use(gutenbeargModule(content, { resolve: (ctx) => ({ version: ctx.query.v }) }));
Deno.serve(router.handle);
```

The module serves its stylesheet, client script and icon sheet at `/@bearmetal/gutenbearg/*`. The
client script is bundled with `Deno.bundle` on first request, so the app needs `--unstable-bundle`.

## Example

`deno task example` runs `examples/bramble`, the design's sample site. Add `?layout=shelves` or
`?layout=den` to switch shells and `?v=0.8` to read an older version (both stick via cookie).

Icons come from webbies' Phosphor sheet, pruned to `ICONS` in `icons.ts`. After changing that list,
run `deno task bm:icons`.
