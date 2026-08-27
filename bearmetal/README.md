# @bearmetal/bearmetal

[![License: MIT](https://badger.bear-metal.dev/?label=License&value=MIT&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://opensource.org/licenses/MIT)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fbearmetal&valueColor=info)](https://jsr.io/@bearmetal/bearmetal)

The `bearmetal` CLI. Built on `@bearmetal/cli` for prompts/styling and `@bearmetal/forge` for flag
validation.

## Drip

Generate a new theme interactively or non-interactively, list and switch the themes available to a
project, and launch the Drip Palette app for visually editing a theme's color scale.

## `generate`

Scaffolding subcommands. Each reads the project's current setup rather than dropping a fixed
template, and runs interactively (a wizard) or non-interactively (from flags).

### `generate route`

Scaffolds route files following the router conventions: a leaf route is a `<segment>.ts` file that
exports a `Router` factory (`usersModule`), and a route with children becomes a `<segment>/`
directory with a `mod.ts` parent that mounts them. Dynamic `:param` segments map to `_param` files.

```sh
# A wizard that asks for the path, methods, filename and schemas.
bearmetal generate route

# A parent /api route for users with every method (GET POST PUT DELETE).
bearmetal generate route --path="/api/users" -CRUD

# GET + POST on /api/users/:id, nested under the existing /api tree.
bearmetal generate route --path="/api/users/:id" -CR
```

The generator understands the project it is run in: it nests new routes under an existing parent
router, promotes a leaf to a parent (moving `api.ts` to `api/mod.ts` and fixing its imports) when it
gains children, appends a method to a route that already exists, wires a new top-level route into
the app's entry file, and leaves hand-written standalone routes untouched.

Method flags (bundle them, e.g. `-CRUD`): `-R/--get`, `-C/--post`, `-U/--put`, `-P/--patch`,
`-D/--delete`, `-O/--options`. Other options: `--path`, `--body-schema=<path>:<export>`,
`--response-schema=[status:]<path>:<export>` (repeatable, alias `--res-schema`), `--filename`,
`--shorthand` (emit the single-method `router.get(path, handler)` form), `--routes-dir`, `--root`,
`--no-wire` and `--dry-run`.
