---
description: Callouts, steps, code groups and feature grids, written with ::: fences.
---

# Containers

A container opens with `:::` followed by a kind and an optional title, and closes with `:::`.
Containers can be nested.

```md
::: tip Reads are subscriptions
Calling a signal inside an effect subscribes the effect.
:::
```

::: tip Reads are subscriptions
Calling a signal inside an effect subscribes the effect.
:::

## Callouts

`tip`, `info`, `warning` and `danger` render as callouts. The title is optional and can include
inline markup, such as a `<Badge/>`.

::: info Kinds
::: danger Nested
Containers nest, so a callout can sit inside steps.
:::
:::

## Steps

`::: steps` turns each `###` heading into a numbered step that owns everything below it, up to
the next step. The [Quick start](../0000-[rocket]-start/0016-quick-start.md) is written this way.

## Code groups

`::: code-group` shows its code blocks as tabs. Each tab is labelled with its block's label.

````md
::: code-group
```sh [deno]
deno add jsr:@bearmetal/gutenbearg
```
```sh [run]
deno run -A jsr:@bearmetal/gutenbearg/cli dev
```
:::
````

::: code-group
```sh [deno]
deno add jsr:@bearmetal/gutenbearg
```
```sh [run]
deno run -A jsr:@bearmetal/gutenbearg/cli dev
```
:::

## Features

`::: features` takes a list whose items read `icon | title | text`. Only the text can carry
markup. The [Introduction](../0000-[rocket]-start/0000-introduction.md) starts with one.
