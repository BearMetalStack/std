---
description: Version directories hold only what changed, and are tied to the package's real version.
---

# Versions and inheritance

A package's docs are split into version directories, and each one holds **only the pages that
changed** in that version. When the site is built, every version is merged with the ones before
it. This is [[inheritance]]:

```txt
packages/core/
  0.8/0000-learn/0000-intro.md        # intro, from 0.8 onwards
  0.8/0016-reference/0016-signal.md   # signal as of 0.8
  0.9/0016-reference/0016-signal.md   # signal, rewritten in 0.9
  0.9/0016-reference/0032-computed.md # new in 0.9
```

Version 0.9 shows `intro` from 0.8 and its own `signal` and `computed`. Pages and sections are
matched by slug, and the newest copy wins. Each page knows the version it first appeared in,
which shows up as "since v0.8".

- `removed: true` in a page's frontmatter is a [[tombstone]]: the page disappears from that
  version onwards.
- The newest version is served at `/<pkg>/…`, and older ones at `/<pkg>/v<version>/…`. Older
  versions show a banner, and the version menu links each page to the same page in every other
  version.

## Linked to the workspace

Gutenbearg links `packages/<id>/` to a package in the surrounding Deno workspace, with no
configuration needed. It looks for a `package:` key in the package's `index.md`, then for a
member named `…/<id>`, then for a member whose directory is called `<id>`. The link gives the
docs their published name and a **current version**.

The current docs version comes from that version and the site's `versioning` setting:

| `versioning` | Package `0.3.2` writes to |
| --- | --- |
| `minor` (default) | `0.3/` |
| `major` | `0/` |
| `exact` | `0.3.2/` |

A version directory that doesn't fit the setting still loads, but `check` warns about it. Because
the tools know the current version, you never type it yourself. `edit` copies a page forward into
the current version, and `new` writes there. See [Generators](../0064-[terminal-window]-cli/0016-generators.md).
