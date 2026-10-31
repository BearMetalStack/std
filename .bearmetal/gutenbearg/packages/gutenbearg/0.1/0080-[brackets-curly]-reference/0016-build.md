---
description: build() writes the whole site to a directory.
---

# build()

```signature [gutenbearg/build.ts]
function build(options?: BuildOptions): Promise<BuildResult>
```

`build()` takes the same options as the module, plus `outDir` (default `dist`) and `strict`. Every
page is a literal route, so diecast can enumerate the whole site from the router alone, with no
manifest. The stylesheet, client script, icon sprite and logos are written explicitly, along with a
`404.html` for static hosts.

| Result | Description |
| --- | --- |
| `report` | diecast's generation report: the pages written and any failures. |
| `diagnostics` | Content problems found while loading. |
| `ok` | `false` if the build was refused because of `strict`, or if diecast failed. |
