# @bearmetal/dev-server

[![License: MIT](https://badger.bear-metal.dev/?label=License&value=MIT&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://opensource.org/licenses/MIT)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fdev-server&valueColor=info)](https://jsr.io/@bearmetal/dev-server)

A zero-config static file server for local development. It serves a directory as-is, bundling and
caching JS/TS/JSX/TSX on demand via `Deno.bundle`, and injects a small script that reloads the page
over server-sent events whenever a watched file changes — including files pulled in transitively
through a bundle's source map. Installable as a standalone `bmdev` binary via the package's
`install` task.
