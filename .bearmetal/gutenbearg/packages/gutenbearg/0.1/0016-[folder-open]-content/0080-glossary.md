---
description: One file per term; pages link them with double brackets and readers get a definition on hover.
---

# Glossary

Each file in `glossary/` defines one term. The file name is its id, the body is the definition,
and `see:` can link to the page that explains it:

```md [glossary/signal.md]
---
term: Signal
see: ../packages/core/0.9/0016-reference/0000-signal.md
---

A container for one value. Reading it inside a tracked scope subscribes that scope.
```

Pages link a term by id: `[[signal]]`, or `[[signal|signals]]` to show a different label.
Readers see the definition on hover or focus. The page's rail also lists every term used on it,
like the [[frontmatter]] and [[slug]] terms on this page.
