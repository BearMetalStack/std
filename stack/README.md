<p align="center">
  <img src="https://cdn.bear-metal.dev/resources/images/bmiconanimated.svg" alt="description" width="300">
</p>

# The BearMetal Stack

Welcome to the BearMetal Stack! A zero-dependency stack for the modern web, powered by Deno. SSR, JSX, and Signals, with a robust UI library to back it all up.

## Get Started

Designed to work with `deno create`, you will be greeted with a setup wizard to configure your application. Simply run

```bash
$ deno create jsr:@bearmetal/stack
```

and answer a few questions.

### Options

The wizard will ask whether to include optional modules: a database connector, an auth module, and a dev proxy. Each can also be toggled directly via flags:

| Flag | Description |
|------|-------------|
| `--use-db` | Include the Postgres database connector |
| `--auth` | Include the auth module |
| `--dev-proxy` | Include a dev proxy (you will be prompted for the host) |

### Learn More

For a more detailed walkthrough of creating your first app, visit the [BearMetal Docs](https://docs.bear-metal.dev/getting-started) to find a full tutorial.

## Features

### SSR

SSR is currently always enabled, however you are not required to use it. Every generated project includes a layout and a home page implemented as middleware, but neither are required and both can be removed.

### Database

Currently, only the Postgres database connector is available. By default, it reads the standard Postgres environment variables (`PGPORT`, `PGHOST`, `PGUSER`, `PGPASSWORD`), but you can override this by passing connection values directly through the config.

### Auth

Auth uses tokens and alias/password authentication by default. OAuth support (Google, Discord, and GitHub) is in progress but not yet available. Passkey support is also on the way. You can extend what gets embedded in the auth token by passing an `AuthConfig` to the module.

### Forge

Forge is a typesafe schema library similar to Zod. Forge schemas are portable; define your schema once and use it for validation, TypeScript inference, and database migrations alike.

Forge schemas also implement `.toJSONSchema()` to support OpenAPI generation, though full OpenAPI integration is not yet complete.

### Drip

Drip is BearMetal's stylesheet and theme manager. By default, the BearMetal theme is applied, but you can customize it by following the tutorial in the Drip docs.

### JSX

BearMetal's JSX implementation is built for minimalism. The client-side layer creates real DOM nodes directly, and the server-side layer renders HTML strings without a virtual DOM.

A few quirks worth knowing:

- **Raw mode:** Adding the `raw` attribute to an element skips escaping on its children. Treat this the same way you would treat `dangerouslySetInnerHTML`, which is to say: carefully.
- **Styles:** Object-based style notation (e.g. `style={{ color: "red" }}`) is not supported. Use plain CSS strings or Drip classes instead.
- **Props:** String props map to HTML attributes as expected. Anything more complex (objects, functions) is set as a property on the DOM element directly.

### Signals

BearMetal builds on the TC39 Signals proposal and exposes a deliberately minimal API for creating signals and effects. Combined with the JSX layer, this gives you fine-grained reactivity without DOM diffing or heavy runtimes (the BearMetal client bundle is just 7 kB without the Signals bundle included).

## Project Status

The project is in active development and is not yet ready for production use. Packages with a major version of `0` are in early alpha; packages at `1` should still be considered beta.
