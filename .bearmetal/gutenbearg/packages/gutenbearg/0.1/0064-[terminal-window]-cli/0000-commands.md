---
description: Serve, check and build a content directory.
---

# Commands

Every command runs as `deno run -A jsr:@bearmetal/gutenbearg/cli <command>` and accepts
`--dir=<path>`, which defaults to `.bearmetal/gutenbearg`. Paths are written in slugs, never
numbers.

| Command | Does |
| --- | --- |
| `dev [--port=8000]` | Serves the site and reloads when content changes. |
| `check` | Reports dead links, duplicate slugs, bad frontmatter and unnumbered files. Exits non-zero if there are any. |
| `build [--out=dist] [--strict]` | Writes a static site through diecast, plus `404.html`. `--strict` refuses to build while `check` has problems. |
| `new page <path> [--after=slug or --before=slug] [--title=…] [--reindex]` | Writes a draft page stub. |
| `new section <path> [--icon=name] [--after or --before] [--reindex]` | Makes a section directory. |
| `edit <pkg>/<section>/<page>` | Copies a page forward into the current version. |
| `changelog <pkg> [--version=X] [--force]` | Drafts a changelog entry from commits. |
| `reindex <path> [--sections] [--dry-run]` | Respaces a directory to multiples of 16. |
| `cut <pkg> <version>` | Starts an empty version directory, which inherits everything. |

The authoring commands are covered in [Generators](0016-generators.md).

In this repository, `deno task gutenbearg <command>` runs the CLI against these docs, and
`deno task docs:gutenbearg` serves them with live reload.
