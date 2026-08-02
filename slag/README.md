# @bearmetal/slag

A microdom for Deno: a small DOM implementation you can construct directly, or install over the
globals so browser-targeted code runs unchanged.

It exists for two jobs:

1. **Testing.** `deno test` has no `document`. Slag gives you a real tree with real custom element
   reactions, instead of another hand-rolled shim that returns `[]` from `querySelectorAll`.
2. **One rendering surface.** Nodes serialize themselves, so the same code can build DOM in a
   browser and HTML on a server.

```ts
import { SlagDocument } from "@bearmetal/slag";

const document = new SlagDocument();
const card = document.createElement("article");
card.classList.add("card");
card.textContent = "hello";

card.toString(); // '<article class="card">hello</article>'
```

## Import order matters

**Read this before installing the globals.** Some modules in this stack read DOM globals at
_module-evaluation_ time, not at call time:

- `@bearmetal/jsx`'s `BMC` captures `globalThis.HTMLElement` as its base class the moment the module
  loads.
- `@bearmetal/jsx/jsx-runtime` chooses the client or the server runtime from
  `typeof document !== "undefined"`, once, on import.

So the globals must exist _before_ those modules are imported. Static imports evaluate in source
order, which makes a side-effect import the reliable way to guarantee that:

```ts
import "@bearmetal/slag/global"; // must come first
import { BMElement } from "@bearmetal/app";
```

Calling `installGlobals()` from inside a test body is too late for those two. It is fine for
anything that reads `document` lazily.

## Installing and uninstalling

`installGlobals()` returns a teardown that restores exactly what was there before — including
"nothing" — so one test file cannot leak its DOM into another's.

```ts
import { installGlobals } from "@bearmetal/slag";

Deno.test("renders", () => {
	const restore = installGlobals();
	try {
		// ...
	} finally {
		restore();
	}
});
```

It installs `window`, `document`, `customElements`, `Node`, `Text`, `Comment`, `Element`,
`HTMLElement`, `SVGElement`, `HTMLTemplateElement`, `DocumentFragment`, `ShadowRoot`, and
`CSSStyleSheet`.

## Test helpers

`@bearmetal/slag/testing` has the two utilities every lifecycle test needs:

```ts
import { createRoot, flushMicrotasks } from "@bearmetal/slag/testing";

const root = createRoot(); // a connected mount point under document.body
root.appendChild(element); // connectedCallback fires
await flushMicrotasks(); // let deferred teardown run
```

## What Slag implements

- **Tree** — the full navigation and mutation surface (`insertBefore`,
  `append`/`prepend`/`before`/`after`, `replaceChildren`, `replaceWith`, `cloneNode`, sibling and
  element-only accessors). Inserting a fragment moves its children and empties it; insertion
  detaches from the previous parent first.
- **Custom elements** — a registry plus `connectedCallback`, `disconnectedCallback`, and
  `attributeChangedCallback` (gated on `observedAttributes`). A same-tree move fires **disconnect
  then connect**, in that order, exactly as a browser does.
- **Events** — capture, bubbling, `stopPropagation`, and `composedPath`, courtesy of Deno's own
  `EventTarget`: it runs the full DOM dispatch algorithm for any target exposing `nodeType` and
  `parentNode`, so Slag inherits it rather than reimplementing it.
- **Shadow DOM** — `attachShadow`, `shadowRoot` (with `closed` honoured), `adoptedStyleSheets`, and
  `<slot>` resolution at serialization time.
- **Selectors** — `querySelector(All)`, `matches`, `closest` over tag, `*`, `#id`, `.class`,
  `[attr]` with `=`/`~=`/`|=`/`^=`/`$=`/`*=`, `:scope`, and the four combinators.
- **Serialization** — `toString()`/`outerHTML`/`innerHTML`, with void elements, escaping, bare
  valueless attributes, raw-text `<script>`/`<style>`, and `<template>` content.

Shadow roots serialize three ways — pass `shadow` to `serialize()`:

| mode                    | output                                                      |
| ----------------------- | ----------------------------------------------------------- |
| `"projected"` (default) | light children rendered through their slots                 |
| `"declarative"`         | `<template shadowrootmode>`, so a browser rebuilds the root |
| `"none"`                | shadow ignored; light children only                         |

## What Slag does not do

- **No HTML parser.** `innerHTML = ""` clears the element; any other string is stored verbatim as
  raw markup. It serializes back out unchanged but is inert — `querySelector` cannot see inside it.
  Same for `insertAdjacentHTML`.
- **No CSS engine.** Stylesheets and inline styles are stored and serialized, never parsed or
  cascaded. `getComputedStyle` returns the element's own inline style.
- **No layout.** `getBoundingClientRect()` is all zeros; `focus`, `blur`, and `scrollIntoView` are
  no-ops. They exist so client code reaches the server without throwing, not so it behaves correctly
  there.
- **A composed event does not escape a shadow root.** Deno tracks a shadow host in an internal slot
  Slag cannot populate, so the event path ends at the root.
- **One process-wide custom element registry**, like a browser's one per window. Use unique tag
  names across test files, or call `resetCustomElements()`.
