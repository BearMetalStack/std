# @bearmetal/jsx

One JSX runtime, for the client and the server.

## Setup

```json
{
	"compilerOptions": {
		"jsx": "react-jsx",
		"jsxImportSource": "@bearmetal/jsx",
		"jsxImportSourceTypes": "@bearmetal/jsx"
	}
}
```

That is the whole configuration, wherever the code runs. There is nothing to import in a `.tsx` file
— the transform injects the runtime.

## One runtime

JSX always builds real DOM nodes.

```tsx
const el = (
	<div class="card">
		<p>Hello</p>
	</div>
);
document.body.appendChild(el);
```

On a server that `document` is [`@bearmetal/slag`](https://jsr.io/@bearmetal/slag), a microdom whose
trees serialize themselves, so the same expression produces markup:

```ts
import { installGlobals, serialize } from "@bearmetal/slag";
installGlobals();

serialize(el); // '<div class="card"><p>Hello</p></div>'
```

`JSX.Element` is therefore a node — `Element | DocumentFragment` — on both sides, and
`appendChild(<div />)` type-checks without a cast anywhere.

::: info **Coming from `@bearmetal/jsx/client` or `@bearmetal/jsx/server`?** Both subpaths are gone.
Point `jsxImportSource` at `@bearmetal/jsx` and import values from `@bearmetal/jsx`.

The split chose a runtime from `typeof document` at import time, which made module evaluation order
load-bearing — and a `.tsx` file could never win that race, because the transform injects its
runtime import above anything the source itself writes. Nothing about import order matters now:
`BMC` re-points its prototype chain at whichever `HTMLElement` is ambient, whenever that changes.

`BMC.serverRender` and `BMC.serverLoad` went with them; their replacement is
[`BMElement.serverInit()`](/getting-started/ssr/data-loading) in `@bearmetal/app`. :::

## Children

A child may be a node, a string, a number, an array of those, or:

**A signal** — anything with a `get()`. The runtime keeps a slot for it and rewrites only that slot
when it changes. Text in, text out, updates the existing text node's data rather than replacing it;
a signal that recomputes to the same node is left alone entirely, so nothing restarts animations,
drops focus or reconnects a custom element for no reason.

```tsx
<span>{this.count}</span>;
```

**A promise** — the slot stays empty until it settles. In a browser it simply fills in; during a
server render the renderer waits for it before serializing, so an `async` function component's
output lands in the response.

```tsx
<section>{loadRow().then((row) => <b>{row.name}</b>)}</section>;
```

**`Html`** — markup that is already safe, inserted verbatim. Strings are escaped; this is how you
opt out.

```tsx
import { Html } from "@bearmetal/jsx";

const trusted = "<em>already safe</em>";

<div>{trusted}</div>; // escaped: &lt;em&gt;already safe&lt;/em&gt;
<div>{new Html(trusted)}</div>; // <em>already safe</em>
<div $raw>{trusted}</div>; // every string child of this element is markup
```

Raw markup goes through a `<template>`, whose content is inert — no image fetches, no script
evaluation, none of the reparenting a host element's parser rules would impose. Slag has no HTML
parser and keeps it verbatim, which is all a server needs from it.

`null`, `undefined` and booleans render nothing, so `{cond && <p/>}` behaves as expected.

## Props

| Prop                      | Behaviour                                                     |
| ------------------------- | ------------------------------------------------------------- |
| `class="a b"`             | Adds the classes. `class-foo={bool}` toggles one.             |
| `onClick={fn}`            | `addEventListener("click", fn)` — any `on*` name, lowercased. |
| `checked={true}`          | A boolean sets or removes the bare attribute.                 |
| `style={obj}` and objects | Assigned as a property, not an attribute.                     |
| `width={40}`              | `width` and `height` take a number and get `px`.              |
| `ref="name"`              | Registers the element on the owning component's `this.refs`.  |
| Anything else             | `setAttribute(key, String(value))`                            |

A `<button>` with no `type` gets `type="button"`, because a stray submit inside a form is never what
was meant.

**A signal prop binds.** If the value is a signal and the target already holds a writable signal
under that name — which is what a `@prop` accessor is — the runtime swaps in the parent's signal, so
both sides share one. If only the value is a signal, it is applied through an effect. If only the
target holds one, its `set()` is called. That last case is why a declared prop never becomes an
attribute, and so never appears in server-rendered markup; see
[Loading data on the server](/getting-started/ssr/data-loading#state-is-not-prop).

**`$bind`** two-way binds a writable signal to an input's value, with `$type` for a custom cast:

```tsx
<input type="number" $bind={this.amount} />
<input type="checkbox" $bind={this.enabled} />
<input $bind={this.tags} $type={(raw) => String(raw).split(",")} />
```

`number` and `range` cast to a number, `checkbox` and `radio` to a boolean, everything else stays a
string.

## Tags

- **A lowercase string** is an element. SVG tag names are created in the SVG namespace, `template`
  gets its children put in `.content`.
- **A function** is called with the props; it is a plain function, so it can be `async` and return a
  promise.
- **A `BMC` subclass** used directly as a tag (`<MyCard />`) renders its registered tag name. It
  works, but it pulls the class into whatever bundle uses it — prefer the tag (`<my-card />`) unless
  you want that.

`<>…</>` is a `DocumentFragment`, which splices in with no wrapper element.

## Exports

```ts
import { BMC, escapeHtml, Fragment, Html, isBMC, jsx, jsxs } from "@bearmetal/jsx";
```

`BMC` is the base class every BearMetal custom element extends — `@bearmetal/app`'s `BMElement`
extends it. It is an `HTMLElement`, whichever one is ambient: it is declared against a placeholder
and re-pointed at the real base as soon as one exists, so a module may reach it before or after the
DOM globals are installed and get the same class either way.

`static client = true` on a subclass marks it client-only: a server render emits its tag and
attributes and nothing else.

### DOM seams

| Export                 | Purpose                                                                     |
| ---------------------- | --------------------------------------------------------------------------- |
| `rebaseOnDom(Class)`   | Keeps a class extending the ambient `HTMLElement` as the globals change.    |
| `onDomChanged(fn)`     | Runs `fn` now and whenever the DOM globals change.                          |
| `notifyDomChanged()`   | Announces that they changed.                                                |
| `currentElementBase()` | The ambient `HTMLElement`, or the placeholder standing in for it.           |
| `DOM_REBASE_HOOKS`     | Global symbol holding the hook set, so a DOM can call it without importing. |

This is what makes "register the components" and "install the microdom" order-independent: whichever
happens second catches up.

### Server-render seams

Used by `@bearmetal/app/ssr`; you would only reach for them writing your own renderer.

| Export                   | Purpose                                                                          |
| ------------------------ | -------------------------------------------------------------------------------- |
| `beginRenderScope()`     | Opens a scope collecting one render's outstanding work.                          |
| `collectInto(scope, fn)` | Runs a **synchronous** `fn` with `scope` collecting; returns the work it raised. |
| `endRenderScope(scope)`  | Closes it. Pair in a `finally`.                                                  |
| `trackPending(promise)`  | Registers work the current render must settle. A no-op in a browser.             |
| `isServerRendering()`    | Whether a render is in flight, including while it awaits.                        |

Rendering is synchronous throughout — that is what lets one runtime serve both sides. Async work is
not awaited in the JSX call graph; it is registered here and patched into the tree when it settles,
the same way a signal is.

### Owner and effect seams

`setEffectImpl(fn)` gives the runtime its reactivity — it carries none of its own, which is what
keeps it a rendering library rather than a framework. `@bearmetal/app` registers the signals-based
implementation on import. `setCurrentOwner`/`getCurrentOwner` set who receives the cleanups and
`ref` registrations produced while a tree is being built; `BMElement` sets itself as owner while its
template renders.
