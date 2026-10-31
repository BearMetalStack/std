---
description: gutenbeargModule() and the GutenbeargModule it returns.
---

# gutenbeargModule()

```signature [gutenbearg/module.tsx]
function gutenbeargModule(options?: GutenbeargOptions): Promise<GutenbeargModule>
```

This loads the content and returns a router module. The module serves one route per page, a 404
for anything else under `base`, and its assets at the reserved `/@bearmetal/gutenbearg/*`. Mount
it after anything that should take priority over its catch-all route.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `dir` | `string` | `.bearmetal/gutenbearg` | The content directory. |
| `base` | `string` | `""` | The path the site is mounted at. Prefixed to every link. |
| `frame` | `FrameKind` | `"document"` | `document`, `shell` or `article`. See [Embedding](../0048-[layout]-presentation/0016-embedding.md). |
| `routes` | `boolean` | `true` | With `false`, the module serves only its assets. |
| `resolve` | `(ctx) => RequestChoices` | — | Chooses `layout` and `frame` for each request. |
| `watch` | `boolean` | `false` | Reloads content when files change. |
| `report` | `function or false` | console | Where diagnostics are sent. |
| `rules` | `StagedRule[]` | — | Extra clawmark rules for custom syntax. |
| `workspace` | `Workspace or null` | found | The workspace packages link to. |

## GutenbeargModule

| Member | Description |
| --- | --- |
| `content` | The site as currently loaded: `SiteContent`. |
| `render(route, { frame, layout })` | Returns `{ status, title, description, view }` for a route. |
| `[Symbol.dispose]()` | Stops adding the stylesheet to the app's `<head>`. |

The client script is bundled with `Deno.bundle` on its first request, so an app serving the
module needs `--unstable-bundle`.
