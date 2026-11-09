# @bearmetal/app

[![License: MIT](https://badger.bear-metal.dev/?label=License&value=MIT&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://opensource.org/licenses/MIT)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fapp&valueColor=info)](https://jsr.io/@bearmetal/app)

The component framework at the center of the stack. `BMElement` wires TC39 Signals, effects, refs,
and context into the Custom Elements lifecycle, so a component written once server-renders through
`app/ssr` and hydrates client-side without a virtual DOM or a diffing pass — signals update only the
DOM nodes that actually changed.

Components are declared with the `@define` decorator and read reactive state through `app/signals`;
`app/context` provides both call-stack-scoped context for SSR and DOM-tree-walking context for the
client. `app/ssr`'s `Layout`/`Page` middleware renders the JSX tree, scans it for the custom
elements actually used, and bundles only those components' client modules into the response.

## Reactive building blocks

Reach for these before wiring signals and effects together by hand. Each has a JSDoc `@example`.

| Need                                         | Use                                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| A derived value                              | `createComputed(fn)`: what it builds is released when its value changes |
| A derived value that needs its previous one  | `createMemo((prev) => next)`                                            |
| A side effect on a specific change           | `watch(source, (next, prev) => cleanup)`                                |
| Something whose life is not a DOM node's     | `createScope(fn)` → `[result, dispose]`                                 |
| Data fetched for a key that changes          | `createResource(key, fetch, { initial })`                               |
| State stored asynchronously, saved on change | `createPersisted(initial, load, save)`                                  |
| State in `localStorage`                      | `storageSignal(key, initial)`                                           |
| One value per id                             | `createFamily(make)`                                                    |
| A list changed by insert/move/remove         | `ListSignal`                                                            |
| An object whose fields are bound one by one  | `StructSignal` (`$.field`)                                              |
| A debounced save, flushable from Cmd+S       | `createSaveTask(save)`, `flushAllSaves()`                               |
| A keyed list                                 | `<For>` / `each()` (`inPlace` to keep rows on change)                   |
| One branch of several                        | `<Switch>` / `<Case>`, `<Show>`                                         |
| Elements that move between parents           | `createKeyedNodes(source, keyOf, render)`                               |
