# @bearmetal/app

[![License: GPL v3](https://badger.bear-metal.dev/?label=License&value=GPL+v3&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://www.gnu.org/licenses/gpl-3.0)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fapp&valueColor=info)](https://jsr.io/@bearmetal/app)

The component framework at the center of the stack. `BMElement` wires TC39 Signals, effects, refs, and context into the Custom Elements lifecycle, so a component written once server-renders through `app/ssr` and hydrates client-side without a virtual DOM or a diffing pass — signals update only the DOM nodes that actually changed.

Components are declared with the `@define` decorator and read reactive state through `app/signals`; `app/context` provides both call-stack-scoped context for SSR and DOM-tree-walking context for the client. `app/ssr`'s `Layout`/`Page` middleware renders the JSX tree, scans it for the custom elements actually used, and bundles only those components' client modules into the response.
