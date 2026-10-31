---
description: Number prefixes, slugs and icons, and the arithmetic that keeps inserts cheap.
---

# Ordering and icons

Every file and directory name follows this pattern:

```txt
NNNN-[icon]-slug(.md)
0016-[rocket]-start-here
0032-signal.md
```

- **`NNNN`** is a four-digit [[order-prefix]]. It only sets the order and never appears in a URL.
- **`[icon]`** is optional and gives a section its icon. It can be any Phosphor icon name, and a
  `-fill` suffix picks the filled style.
- **`slug`** is the name used in URLs and links. Renumbering a file never changes its slug, so
  links survive.

A page's title comes from frontmatter `title`, then from a leading `# heading`, which is taken out
of the body, and then from the slug. A section's title is its slug titleized, unless the section
has an `index.md` that sets `title`, `icon` or `description`.

## Numbers

New entries go 16 after the last one. An entry inserted between two others takes the halfway
number, so nothing else has to be renamed:

| Between | New number |
| --- | --- |
| end, after `0032` | `0048` |
| `0000` and `0016` | `0008` |
| `0008` and `0009` | no room |

When there's no room left, `reindex` respaces the directory to 0, 16, 32 and so on, keeping the
order. `new … --reindex` does this for you. You shouldn't need to type a number yourself; see
[Generators](../0064-[terminal-window]-cli/0016-generators.md).

::: warning Unnumbered files
A file without a prefix still loads, but sorts after the numbered ones, and `check` warns about
it.
:::
