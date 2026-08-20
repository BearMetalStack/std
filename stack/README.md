<p align="center">
  <img src="https://cdn.bear-metal.dev/resources/images/bmiconanimated.svg" alt="description" width="300">
</p>

# The BearMetal Stack

Welcome to the BearMetal Stack! A zero-dependency stack for the modern web, powered by Deno. SSR,
JSX, and Signals, with a robust UI library to back it all up.

## Get Started

Designed to work with `deno create`, you will be greeted with a setup wizard to configure your
application. Simply run

```bash
$ deno create jsr:@bearmetal/stack
```

and answer a few questions.

### Options

The wizard will ask whether to include optional modules: a database connector, an auth module, and a
dev proxy. Each can also be toggled directly via flags:

| Flag                 | Description                                                        |
| -------------------- | ------------------------------------------------------------------ |
| `--name=<app>`       | Name of the app, and the directory it is created in                |
| `--here`             | Create the app in the current directory, which must be empty       |
| `--template=<name>`  | Template to scaffold from                                          |
| `--default`          | Take every default and ask nothing beyond the name                 |
| `--use-db=postgres`  | Include the Postgres database connector                            |
| `--auth`             | Include the auth module (`--no-auth` answers the question as well) |
| `--dev-proxy=<host>` | Serve the app under `<host>` in development                        |
| `--dry-run`          | Print what would be written without writing it                     |
| `-n`                 | Never prompt; missing required args become an error                |

`deno create jsr:@bearmetal/stack -- --help` prints the same table, generated from the definitions
the wizard prompts from.

### Learn More

For a more detailed walkthrough of creating your first app, visit the
[BearMetal Docs](https://docs.bear-metal.dev/getting-started) to find a full tutorial.

## Features

### SSR

SSR is currently always enabled, however you are not required to use it. Every generated project
includes a layout and a home page implemented as middleware, but neither are required and both can
be removed.

### Components and the client bundle

Everything under `components/` (or `src/components/`) is registered on the server and bundled for
the browser as one file, served from `/@bearmetal/components/index` and referenced from every page's
`<head>`. Two consequences worth knowing:

- A view names a component by its tag — `<my-counter />` — and does not import it. That is what the
  directory buys you.
- The bundle is the whole app, not the page. A page-sized bundle breaks the moment a client-side
  `<Router>` navigates to a page whose components were never shipped.

Drop a `components/manifest.ts` in to take over the list explicitly, and
`components/<subset>.manifest.ts` to build extra bundles you load yourself. Component stylesheets
are collected server-side and served alongside as `/@bearmetal/components/index.css`, so the first
paint is styled without waiting for the bundle.

### Database

Currently, only the Postgres database connector is available. By default, it reads the standard
Postgres environment variables (`PGPORT`, `PGHOST`, `PGUSER`, `PGPASSWORD`), but you can override
this by passing connection values directly through the config.

### Auth

Auth uses tokens and alias/password authentication by default. OAuth support (Google, Discord, and
GitHub) is in progress but not yet available. Passkey support is also on the way. You can extend
what gets embedded in the auth token by passing an `AuthConfig` to the module.

### Forge

Forge is a typesafe schema library similar to Zod. Forge schemas are portable; define your schema
once and use it for validation, TypeScript inference, and database migrations alike.

Forge schemas also implement `.toJSONSchema()` to support OpenAPI generation, though full OpenAPI
integration is not yet complete.

### Drip

Drip is BearMetal's stylesheet and theme manager. By default, the BearMetal theme is applied, but
you can customize it by following the tutorial in the Drip docs.

### JSX

BearMetal's JSX implementation is built for minimalism, and there is one of it. The runtime builds
real DOM nodes on both sides — in a browser that is the browser's `document`, on a server it is
[`@bearmetal/slag`](https://jsr.io/@bearmetal/slag), a microdom whose trees serialize themselves. A
component is written once and renders in both places.

A few quirks worth knowing:

- **Raw mode:** Adding the `raw` attribute to an element skips escaping on its children. Treat this
  the same way you would treat `dangerouslySetInnerHTML`, which is to say: carefully.
- **Styles:** Object-based style notation (e.g. `style={{ color: "red" }}`) is not supported. Use
  plain CSS strings or Drip classes instead.
- **Props:** String props map to HTML attributes as expected. Anything more complex (objects,
  functions) is set as a property on the DOM element directly.

### Signals

BearMetal builds on the TC39 Signals proposal and exposes a deliberately minimal API for creating
signals and effects. Combined with the JSX layer, this gives you fine-grained reactivity without DOM
diffing or heavy runtimes (the BearMetal client bundle is just 7 kB without the Signals bundle
included).

## Project Status

The project is in active development and is not yet ready for production use. Packages with a major
version of `0` are in early alpha; packages at `1` should still be considered beta.
