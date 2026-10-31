---
description: Where each kind of content lives in the content directory.
---

# Layout

```txt
.bearmetal/gutenbearg/
  index.md                          home page; `site:` holds the site settings
  glossary/<term>.md                one term per file
  guides/<section>/<page>.md        unversioned, across packages → /guides/<section>/<page>
  packages/<pkg>/
    index.md                        name, status, description, package
    <version>/<section>/<page>.md   → /<pkg>/<section>/<page> (latest)
                                    → /<pkg>/v<version>/<section>/<page> (older)
    changelog/<version>.md          one release per file
```

Every directory and page name follows the same pattern, described in
[Ordering and icons](0016-ordering.md).

## Site settings

The `site:` block in the root `index.md`:

| Key | Purpose |
| --- | --- |
| `name` | Shown beside the logo and in `<title>`. |
| `layout` | Default [[shell]]: `trail`, `shelves` or `den`. |
| `repository` | Repository link in the header. |
| `sourceBase` | Prefix for the source links on `signature` blocks. |
| `editBase` | Prefix for "Edit this page" links. |
| `theme` | A drip theme, for standalone sites. |
| `versioning` | `minor` (default), `major` or `exact`. See [Versions](0032-versions.md). |
| `workspace` | `false` stops packages linking to the surrounding Deno workspace. |

The rest of the root `index.md` makes up the home page. `name`, `text`, `tagline`, `badge`, `primary` and
`secondary` fill the hero, and the body goes underneath it.

## Packages

A directory under `packages/` is one package's docs. Its `index.md` is optional:

| Key | Purpose |
| --- | --- |
| `name` | Display name. Defaults to the linked workspace package's name, else the directory. |
| `status` | `stable`, `beta`, `alpha` or `deprecated`. |
| `description` | One line about the package. |
| `package` | The workspace package these docs belong to, when the directory name doesn't match it. |

A package with sections directly inside it, and no version directories, is unversioned.
