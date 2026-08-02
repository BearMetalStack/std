/**
 * Side-effect entry point: importing this module installs Slag over the DOM
 * globals immediately.
 *
 * Put it **first** in the import list of any module that touches
 * `@bearmetal/jsx` or `@bearmetal/app` — both read `HTMLElement`/`document` when
 * they are evaluated, not when they are called.
 *
 * ```ts
 * import "@bearmetal/slag/global";
 * import { MyComponent } from "./my-component.ts"; // reaches jsx/app
 * ```
 *
 * (The second line names a local module deliberately: an import specifier
 * written in a doc comment is indistinguishable from a real one to
 * `workspace_scripts/dep_graph.ts`, which scans source text, so naming a
 * workspace package here would invent a dependency edge that does not exist.)
 *
 * For a teardown-able install (per-test setup), import `installGlobals` from
 * `@bearmetal/slag` and call it yourself.
 *
 * @module
 */

import { installGlobals } from "./lib/global.ts";

installGlobals();
