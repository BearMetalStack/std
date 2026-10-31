---
description: trail, shelves and den, three ways to frame the same content.
---

# Shells

Every page renders inside one of three [[shell|shells]]. Choose the site's default with
`site.layout`, or per request with `resolve`.

| Shell | Header | Sidebar | Right rail |
| --- | --- | --- | --- |
| `trail` | Breadcrumbs, where each crumb is a menu of its siblings | The section as a line of stations | A page map showing time left |
| `shelves` | Package switcher and tabs | Sections as shelves, with a live filter | A table of contents that fills as you read |
| `den` | Wide search | Recently read pages | Up next, and a paw-print trail |

All three render complete on the server. The small client script only adds what a browser can
know: which pages you've read, how far down the page you are, search, and the code tab you
prefer.

```ts
await gutenbeargModule({
  resolve: (ctx) => ({ layout: ctx.query.layout as ShellLayout | undefined }),
});
```
