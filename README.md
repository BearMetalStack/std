<p align="center">
  <img src="https://cdn.bear-metal.dev/resources/images/bmiconanimated.svg" alt="BearMetal" width="240">
</p>

<h1 align="center">BearMetal</h1>

<p align="center">The zero-dependency stack for the modern web.</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://badger.bear-metal.dev/?label=License&value=MIT&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=" alt="License: MIT"></a>
  <a href="https://deno.com"><img src="https://badger.bear-metal.dev/?label=Runtime&value=Deno&valueColor=info" alt="Runtime: Deno"></a>
  <a href="#project-status"><img src="https://badger.bear-metal.dev/?label=Status&value=Alpha&valueColor=warning" alt="Status: Alpha"></a>
</p>

SSR, JSX, and TC39 Signals-based reactivity, plus everything a server needs around them — a
type-safe router, schema validation, a database layer, auth, websockets, theming, and scaffolding.
Every layer is written in-house for Deno; nothing outside the standard library and BearMetal's own
packages is required to run any of it.

## Get started

```bash
deno create jsr:@bearmetal/stack
```

The wizard walks you through picking a database connector, auth, and a dev proxy, then assembles a
working app from the packages below. See the [docs](https://docs.bear-metal.dev) for a full
walkthrough.

## Ethos

- **Zero dependencies.** Every package is built from scratch on top of Deno and the Web platform —
  no framework, no bundler plugin ecosystem, no supply chain to audit beyond Deno itself.
- **A stack, not a framework.** Each package is useful on its own and composes with the others
  through small, explicit interfaces (router `Module`s, forge schemas, DOM signals) rather than a
  shared runtime you have to buy into wholesale.
- **One workspace, independently versioned.** This repo is a Deno workspace monorepo — every
  directory below with its own `deno.json` is a separately published `@bearmetal/*` package,
  versioned and released on its own schedule.
- **Honest about where it's at.** Nothing here is production-ready yet. Version numbers say so up
  front — see [Project status](#project-status).

## Packages

| Package                        | Purpose                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| [`app`](./app)                 | Custom element framework — signals, effects, refs, and SSR/hydration without a virtual DOM.         |
| [`auth`](./auth)               | Token-based authentication as a router module, with pluggable login methods.                        |
| [`badger`](./badger)           | The SVG badge service behind the badges on this page.                                               |
| [`bearmetal`](./bearmetal)     | CLI for managing Drip themes and running the Drip Palette app.                                      |
| [`cache`](./cache)             | Response caching as router middleware, with pluggable storage providers.                            |
| [`clawmark`](./clawmark)       | Rule-based markup engine — a configurable parser/renderer for Markdown-like syntax.                 |
| [`cli`](./cli)                 | Terminal styling, prompts, and argument parsing used to build every CLI in the stack.               |
| [`cog`](./cog)                 | Internal flow-builder primitives for the stack setup wizard.                                        |
| [`db`](./db)                   | Postgres/KV connector exposed as a router module, with a typed cross-package table registry.        |
| [`devproxy`](./devproxy)       | Dev-time reverse proxy integration — serves local apps under a shared `*.bear-metal.dev` subdomain. |
| [`dev-server`](./dev-server)   | Zero-config static file server with bundling and live reload.                                       |
| [`drip`](./drip)               | Theme and stylesheet generation — CSS custom properties, palettes, and a visual editor.             |
| [`events`](./events)           | Promise- and async-generator-based utilities for `EventTarget`/`EventSource`.                       |
| [`forge`](./forge)             | Runtime schema validation, TypeScript inference, and JSON Schema generation.                        |
| [`internal`](./internal)       | Workspace-internal trust primitives. Not published.                                                 |
| [`jsx`](./jsx)                 | JSX runtimes for client (real DOM) and server (SSR string) rendering.                               |
| [`miscellanea`](./miscellanea) | Zero-dependency utility grab bag that nearly everything else depends on.                            |
| [`router`](./router)           | Type-safe HTTP router — middleware, composable modules, typed DI services, schema-validated routes. |
| [`sockpuppet`](./sockpuppet)   | WebSocket channel server with a matching browser client.                                            |
| [`stack`](./stack)             | The `deno create` scaffolding wizard that assembles a new BearMetal app.                            |
| [`webbies`](./webbies)         | UI component library built on `app`.                                                                |

## Project status

The project is in active development and is not yet ready for production use. Packages with a major
version of `0` are early alpha; packages at `1` should still be considered beta.

## License

MIT. See each package's `deno.json` for specifics.
