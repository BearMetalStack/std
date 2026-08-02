---
next:
  text: "Quick Start"
  link: "./quickstart"
prev: false
---

# Getting Started

Designed to work with `deno create`, you will be greeted with a setup wizard to configure your
application. Simply run

```bash
$ deno create jsr:@bearmetal/stack
```

and answer a few questions.

### Options

The wizard will ask whether to include optional modules: a database connector, an auth module, and a
dev proxy. Each can also be toggled directly via flags:

| Flag          | Description                                             |
| ------------- | ------------------------------------------------------- |
| `--use-db`    | Include the Postgres database connector                 |
| `--auth`      | Include the auth module                                 |
| `--dev-proxy` | Include a dev proxy (you will be prompted for the host) |
