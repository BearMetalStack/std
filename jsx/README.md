# @bearmetal/jsx

JSX runtimes for client and server, in one package.

[![License: GPL v3](https://badger.bear-metal.dev/?label=License&value=GPL+v3&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://www.gnu.org/licenses/gpl-3.0)

## Setup

Add to your project's `deno.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@bearmetal/jsx/server"
  }
}
```

Use `@bearmetal/jsx/client` instead if you're targeting the DOM. You don't need to import anything in your `.tsx` files - the runtime is injected automatically.

## Client vs server

| | `@bearmetal/jsx/client` | `@bearmetal/jsx/server` |
|---|---|---|
| `JSX.Element` | `Element \| DocumentFragment` | `Html` (a string wrapper) |
| Output | Live DOM nodes via `document.createElement` | HTML strings via `Html` |
| Use for | Web components, browser-side rendering | SSR, static HTML generation |

**Server** renders to an `Html` instance whose `.raw` holds the HTML string:

```tsx
import { Html } from "@bearmetal/jsx";

const page = <html lang="en"><body><h1>Hello</h1></body></html>;
// page instanceof Html
console.log(page.raw); // <html lang="en"><body><h1>Hello</h1></body></html>
```

String children are HTML-escaped by default. Use `raw` to opt out:

```tsx
const trusted = "<em>already safe</em>";
<div raw>{trusted}</div>  // not escaped
<div>{trusted}</div>       // escaped: &lt;em&gt;...
```

**Client** produces real DOM nodes:

```tsx
import { BMC } from "@bearmetal/jsx/client";

const el = <div class="card"><p>Hello</p></div>;
document.body.appendChild(el);
```

## Shared exports

`@bearmetal/jsx` (the root) exports the shared primitives used by both runtimes:

```ts
import { Html, escapeHtml, BMC, isBMC } from "@bearmetal/jsx";
```

`Html` wraps a raw HTML string and passes through unescaped when used as a child in server JSX. `BMC` is the base class for web components that support both server rendering and client-side hydration.
