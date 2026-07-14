# @bearmetal/db

[![License: GPL v3](https://badger.bear-metal.dev/?label=License&value=GPL+v3&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://www.gnu.org/licenses/gpl-3.0)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fdb&valueColor=info)](https://jsr.io/@bearmetal/db)

A Postgres/KV connector exposed as a `@bearmetal/router` module and typed `Service`. `dbModule()` registers a `db` service that any handler can retrieve via `ctx.getService(dbToken)` for querying, migrations, and schema extension, with migrations run automatically on startup outside of production.

Table shapes are tracked through the `TableRegistry` pattern — packages that own a table extend an open `interface TableRegistry {}` via declaration merging in their own `mod.ts`, so `db.table("their_table")` resolves to a properly typed `Queryable` anywhere in the dependency tree, not just where the table was defined.
