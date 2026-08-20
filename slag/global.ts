/**
 * Side-effect entry point: importing this module installs Slag over the DOM
 * globals immediately.
 *
 * ```ts
 * import "@bearmetal/slag/global";
 * ```
 *
 * Import order used to matter here, and no longer does. Installing announces
 * itself, and the one class that has to choose a base class at module-evaluation
 * time — the custom element base in the rendering stack — re-points itself when
 * it hears. A module that reached that stack *before* this line ends up with the
 * same `HTMLElement` as one that came after.
 *
 * For a teardown-able install (per-test setup), import `installGlobals` from
 * `@bearmetal/slag` and call it yourself.
 *
 * @module
 */

import { installGlobals } from "./lib/global.ts";

installGlobals();
