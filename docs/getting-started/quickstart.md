---
next:
  text: "Components"
  link: "./components/index"
prev:
  text: "Getting Started"
  link: "./index"
---

# Quick Start

Configuration wizards are useful, but if you know exactly what you want, there are a couple of quick
start options.

As a rule, Setup will always require a name. You can use the `--name=<app name>` or the `--here`
flag to set the name to skip the prompt.

| Flag                | Description                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `--name=<app name>` | Sets the app name and creates a new directory at `<app name>`                                                                            |
| `--here`            | Sets the app name to the name of the current directory and initialized the app in the current directory (requires directory to be empty) |

## Default Template

The default template comes with no bells nor whistles, just an SSR app with interactive islands.

```bash
$ deno create jsr:@bearmetal/stack -- --default --here
```

## Templates

There are various templates that exist and more are well on their way.

Create a new app with a template:

```bash
$ deno create jsr:@bearmetal/stack -- --template=<template name> --here
```

### Available templates

| Template Name | Description                                                          |
| ------------- | -------------------------------------------------------------------- |
| default       | An SSR app with interactive islands. The only one shipping right now |

More are on their way: a dashboard, an admin app with a public and an authenticated view, and blog
and docs templates that serve markdown as static pages.

## Everything else

Every question the wizard asks is also a flag, so a fully unattended run is just a matter of
answering them all. `-n` makes anything still missing an error rather than a prompt.

| Flag                 | Description                                         |
| -------------------- | --------------------------------------------------- |
| `--use-db=postgres`  | Include the Postgres database connector             |
| `--auth`/`--no-auth` | Include the auth module (auth requires a database)  |
| `--dev-proxy=<host>` | Serve the app under `<host>` in development         |
| `--dry-run`          | Print what would be written without writing it      |
| `-n`                 | Never prompt; missing required args become an error |

```bash
$ deno create jsr:@bearmetal/stack -- --here --auth --use-db=postgres -n
```

`--help` prints the same table, generated from the definitions the wizard prompts from.
