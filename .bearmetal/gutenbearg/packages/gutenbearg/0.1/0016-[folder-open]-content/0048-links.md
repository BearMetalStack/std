---
description: Link to files, not URLs. Links follow the version being read, and dead links are reported.
---

# Links

Link to the markdown file, with a path relative to the current file:

```md
See [signal()](../0016-[brackets-curly]-reference/0000-signal.md#returns).
```

Gutenbearg resolves the link by slugs, not by exact file name, so renumbering never breaks it. A
`#fragment` is kept. Links to URLs and absolute paths pass through unchanged.

- **Within a package**, a link follows the version being read. On the v0.8 pages, the link above
  points at v0.8's `signal`, even though the file it names is in 0.9.
- **Into another package**, a link goes to that package's latest version.
- **Glossary terms** are written `[[term]]` or `[[term|label]]`. See [Glossary](0080-glossary.md).

A link that resolves to nothing is reported by `check`, and shown as a warning in `dev`.
