---
next:
    text: 'Components'
    link: './components/index'
prev:
    text: 'Getting Started'
    link: './index'
---

# Quick Start

Configuration wizards are useful, but if you know exactly what you want, there are a couple of quick start options.

As a rule, Setup will always require a name. You can use the `--name=<app name>` or the `--here` flag to set the name to skip the prompt. 

| Flag | Description |
|------|-------------|
| `--name=<app name>` | Sets the app name and creates a new directory at `<app name>` |
| `--here` | Sets the app name to the name of the current directory and initialized the app in the current directory (requires directory to be empty) |

## Default Template

The default template comes with no bells nor whistles, just an SSR app with interactive islands.

```bash
$ deno create jsr:@bearmetal/app -- --default --here
```

## Templates

There are various templates that exist and more are well on their way.

Create a new app with a template:
```bash
$ deno create jsr:@bearmetal/app -- --template=<template name> --here
```

### Available templates

| Template Name | Description |
|---------------|-------------|
| dashboard | A simple dashboard template |
| admin | An administrative dashboard that has a public view and a view that requires auth |
| blog | A blog template that serves markdown as static pages |
| docs | A docs template that serves markdown as static pages |
