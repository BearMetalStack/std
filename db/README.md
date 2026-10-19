# @bearmetal/db

[![License: MIT](https://badger.bear-metal.dev/?label=License&value=MIT&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://opensource.org/licenses/MIT)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fdb&valueColor=info)](https://jsr.io/@bearmetal/db)

A Postgres/SQLite connector exposed as a `@bearmetal/router` module and typed `Service`. `dbModule()`
registers a `db` service that any handler can retrieve via `ctx.getService(dbToken)` for querying,
migrations, and schema extension, with migrations run automatically on startup outside of
production.

Table shapes are tracked through the `TableRegistry` pattern — packages that own a table extend an
open `interface TableRegistry {}` via declaration merging in their own `mod.ts`, so
`db.table("their_table")` resolves to a properly typed `Queryable` anywhere in the dependency tree,
not just where the table was defined.

## SQLite

`dbModule("sqlite", { path })` stores everything in one file through `node:sqlite`, which ships with
Deno, so it needs no database server and works inside a `deno compile` binary. It speaks the same
`Queryable` API and runs the same migrations, with two limits SQLite imposes: `addColumn` on an
existing table must be optional (or added with `m.raw()` and a `DEFAULT`), and `retypeColumn` is
refused in favour of rebuilding the table. Booleans come back as `0`/`1`, and objects are stored as
JSON text.

```ts
router.use(dbModule("sqlite", { path: "./data/app.sqlite" }));
```
