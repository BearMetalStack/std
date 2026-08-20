# @bearmetal/jsx

One JSX runtime, for the client and the server.

[![License: GPL v3](https://badger.bear-metal.dev/?label=License&value=GPL+v3&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://www.gnu.org/licenses/gpl-3.0)

## Setup

Add to your project's `deno.json`:

```json
{
	"compilerOptions": {
		"jsx": "react-jsx",
		"jsxImportSource": "@bearmetal/jsx"
	}
}
```

That is the whole configuration, wherever the code runs. You don't need to import anything in your
`.tsx` files — the runtime is injected automatically.

## One runtime

JSX always builds real DOM nodes:

```tsx
const el = (
	<div class="card">
		<p>Hello</p>
	</div>
);
document.body.appendChild(el);
```

On a server, `document` is [`@bearmetal/slag`](https://jsr.io/@bearmetal/slag) — a microdom whose
trees serialize themselves — so that same code produces markup:

```ts
import { installGlobals, serialize } from "@bearmetal/slag";
installGlobals();

serialize(el); // '<div class="card"><p>Hello</p></div>'
```

There is no second, string-building runtime, so a component has one implementation and one set of
behaviour rather than two that have to be kept in agreement.

There used to be `@bearmetal/jsx/client` and `@bearmetal/jsx/server`, chosen from `typeof document`
at import time. That made module evaluation order load-bearing — and a `.tsx` file could never win,
because the transform injects its runtime import above anything the source itself writes. Both
subpaths are gone; import `@bearmetal/jsx` or `@bearmetal/jsx/jsx-runtime`.

## Children

String children are escaped. `Html` wraps markup that is already safe, and passes through untouched:

```tsx
import { Html } from "@bearmetal/jsx";

const trusted = "<em>already safe</em>";

<div>{trusted}</div>; // escaped: &lt;em&gt;already safe&lt;/em&gt;
<div>{new Html(trusted)}</div>; // <em>already safe</em>
<div $raw>{trusted}</div>; // <em>already safe</em>
```

A child may also be:

- a **signal** — anything with a `get()`. The runtime holds a slot for it and updates that slot when
  it changes, without touching the rest of the tree.
- a **promise** — the slot stays empty until it resolves. During a server render the renderer waits
  for it before serializing, so an `async` component's output lands in the response.

## Exports

```ts
import { BMC, escapeHtml, Html, isBMC } from "@bearmetal/jsx";
```

`BMC` is the base class for web components. It extends whichever `HTMLElement` is ambient and
re-points itself if that changes, so it does not matter whether a microdom was installed before or
after the module loaded.
