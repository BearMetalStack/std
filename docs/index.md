---
layout: home

hero:
  name: "BearMetal"
  text: "The zero-dependency stack for the modern web"
  tagline: SSR, JSX, and Signals. Powered by Deno.
  image:
    src: https://cdn.bear-metal.dev/resources/images/bmiconanimated.svg
    alt: BearMetal
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Package Reference
      link: /app

features:
  - title: "@bearmetal/app"
    details: Custom element framework with signals, effects, keyed lists, and SSR. Build reactive components that server-render and hydrate without a virtual DOM.
    link: /app
  - title: "@bearmetal/router"
    details: Type-safe HTTP router with middleware, schema validation, a composable module system, and built-in response helpers. The backbone of every BearMetal server.
    link: /router
  - title: "@bearmetal/forge"
    details: Runtime validation, TypeScript inference, and JSON Schema generation in one portable library. Define your schema once and use it everywhere.
    link: /forge
  - title: "@bearmetal/events"
    details: Promise- and async-generator-based event utilities for EventTarget and EventSource. Typed, composable, and browser-friendly.
    link: /events
  - title: "@bearmetal/sockpuppet"
    details: WebSocket channel server with a matching browser client. Channels, middleware, pub/sub, and connection pooling — all wired to the router.
    link: /sockpuppet
  - title: "@bearmetal/clawmark"
    details: A rule-based markup engine that runs both ways. Markdown to HTML, and HTML, docx, or odt back to markdown — driven by a swappable rule set rather than a fixed grammar.
    link: /clawmark/
  - title: "@bearmetal/cli"
    details: Everything a terminal program needs — inline prompts and menus that don't eat your scrollback, repaintable regions, a widget contract, and an arg parser that turns its own definitions into prompts and --help.
    link: /cli/
  - title: "@bearmetal/den"
    details: Application directories that follow the OS — XDG, the macOS Library layout, Windows roaming and local — plus file handles that stage, flush, and never let a path escape.
    link: /den
---
