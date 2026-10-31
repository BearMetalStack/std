---
description: The keys a page's frontmatter understands, and the YAML it's written in.
---

# Frontmatter

| Key | Purpose |
| --- | --- |
| `title` | Overrides the title from the leading `# heading` or the slug. |
| `description` | The line shown under the title. Also used for `<meta name="description">`. |
| `status` | `stable`, `beta`, `alpha` or `deprecated`, shown as a badge. |
| `updated` | The date of the last change, as you want it displayed. |
| `new` | Marks the page as new in the navigation. |
| `draft` | Shows the page as "still hibernating", in its place in the navigation. |
| `removed` | A [[tombstone]]: drops the page from this version onwards. |

Any other keys are kept and ignored.

## The YAML

Frontmatter is parsed by clawmark's own YAML subset, so it needs no dependencies. It supports
scalars, quoted strings, numbers, booleans, `null`, inline and block lists, nested maps,
`|` and `>` blocks, and `#` comments. Anything it can't read is reported with its line number.

::: warning Numbers stay numbers
`version: 0.10` reads as the number `0.1`. Quote any value that only looks like a number:
`version: "0.10"`.
:::
