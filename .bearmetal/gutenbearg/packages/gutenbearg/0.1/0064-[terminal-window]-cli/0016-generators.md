---
description: new, edit and changelog work out numbers and versions so you never type them.
---

# Generators

The authoring commands work out the numbers and version directories for you. If a path starts
with a package id rather than `guides` or `packages`, it refers to that package's **current
docs version**. That version comes from the package's `deno.json`, as described in
[Versions](../0016-[folder-open]-content/0032-versions.md).

## new

```sh
gutenbearg new page core/reference/batch --after=computed
gutenbearg new section core/advanced --icon=gear
```

The page is numbered against everything the current version inherits, not only the files already
in its directory. If its section only exists in an older version, a section directory with the same
name is created in the current version. Pages start with `draft: true`, so they show as
"hibernating" until you remove that line.

## edit

```sh
gutenbearg edit core/reference/signal
# copied forward to packages/core/0.4/0016-[brackets-curly]-reference/0000-signal.md
```

Versions inherit, so changing a page for a new release means copying it into the new version
first. Otherwise you'd be changing what older versions show. `edit` copies the newest older copy
into the current version, keeping the section and file names, and prints where it went. If the
page is already in the current version, it only prints the path.

## changelog

```sh
gutenbearg changelog core
# drafted packages/core/changelog/0.4.0.md from 6 commit(s) since @bearmetal/core@0.3.2
```

This reads the commits since the package's last `<name>@<version>` tag, which is the format
`workspace:bump-versions` uses, and keeps those whose scope names the package:

| Commit | Becomes |
| --- | --- |
| `feat(core): …` | `added` |
| `fix(core): …` | `fixed` |
| `refactor(core): …`, `perf(core): …` | `changed` |
| `feat(core)!: …`, or a `BREAKING CHANGE:` footer | `breaking` |
| `docs`, `chore`, `test`, `style`, `ci`, `build` | left out |

The draft lists entries oldest first, and it's meant to be edited before release. By default it
uses the version in `deno.json`. If that version is already tagged, the commits belong to the
next release, so pass `--version`. Passing a version that's already tagged reads up to that tag
and uses its date, which is how you backfill past releases. Existing files are only replaced
with `--force`.
