---
description: Badges, glossary links, heading anchors and tables.
---

# Inline pieces

## Badges

`<Badge type="warn" text="deprecated"/>` renders <Badge type="warn" text="deprecated"/>. The type
can be `tip`, `info`, `warn` or `danger`. The tag is written exactly as VitePress writes it, so
existing content ports over unchanged.

## Glossary links

`[[term]]` links a [[glossary]] term and shows its definition on hover. `[[term|label]]` shows
a different label. A term that doesn't exist is shown as plain text and reported.

## Headings

Every heading gets an id made from its text, and repeated ids are numbered. Headings at level 2 and
3 make up the page outline, which the layouts show as a minimap, a table of contents or a trail.

## Tables

Pipe tables render as styled tables, and their cells can hold inline markup.

| Syntax | Renders |
| --- | --- |
| `[[slug]]` | a glossary term: [[slug]] |
| `<Badge text="new"/>` | <Badge text="new"/> |
