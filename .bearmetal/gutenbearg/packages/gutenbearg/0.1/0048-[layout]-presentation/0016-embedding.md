---
description: Render the docs inside your app's own layout, with your header and theme around them.
---

# Embedding in an app

By default every page is a complete HTML document. To put the docs inside your app instead,
mount the module after your app's `Layout()` and choose a [[frame]]:

```tsx [main.tsx]
import { Layout } from "@bearmetal/app/ssr";
import { gutenbeargModule } from "@bearmetal/gutenbearg";

router.use(Layout(AppLayout));
router.use(await gutenbeargModule({ base: "/docs", frame: "shell" }));
```

| Frame | What comes along |
| --- | --- |
| `document` | The whole page: header, theme toggle, drip. The default. |
| `shell` | Sidebar and right rail, with a bar for areas, search and versions in place of the header. |
| `article` | Only the page. |

Embedded pages render through `Page()`, so they get your app's `<html>` and header. The stylesheet
is added to your `<head>` only on routes under `base`. `resolve` can also return a `frame` for each
request. If no `Layout()` ran first, gutenbearg warns once and serves complete documents instead.

## What your app provides

- **Drip and the theme.** Embedded docs use your `BMDripBase` and follow your `data-theme`.
  `site.theme` is ignored.
- **The header height.** If your header is sticky, set `--gb-host-offset` to its height so the
  docs bar and sidebars stay below it.

## Routing it yourself

Pass `routes: false` and the module serves only its assets. You then call `render()` for each page
wherever you want it:

```tsx
const docs = await gutenbeargModule({ base: "/help", routes: false });
router.use(docs);
router.route("/help/*").get(Page((ctx) => {
  const route = new URL(ctx.request.url).pathname.slice("/help/".length);
  return <HelpFrame>{docs.render(route, { frame: "article" }).view()}</HelpFrame>;
}));
```

The view `render()` returns brings its own stylesheet link.
