---
description: One file per release, drafted from your commits.
---

# Changelogs

Each release of a package is one file, `packages/<pkg>/changelog/<version>.md`:

```md [packages/core/changelog/0.9.2.md]
---
date: Oct 2, 2026
---

- added: `batch()` for grouping writes
- fixed: effects ran twice after a cycle error
- breaking: `createSignal` is now `signal`
```

Each item starts with its type: `added`, `changed`, `fixed`, `deprecated` or `breaking`. An item
without a type is read as `changed`, and `check` points it out. Every package with releases gets
its own changelog page, and `/changelog` combines all of them, with filters by type and package.

You don't have to write these from scratch. `gutenbearg changelog <pkg>` drafts one from your
conventional commits; see [Generators](../0064-[terminal-window]-cli/0016-generators.md).
