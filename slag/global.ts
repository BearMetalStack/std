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
 * import { BMElement } from "@bearmetal/app";
 * ```
 *
 * For a teardown-able install (per-test setup), import `installGlobals` from
 * `@bearmetal/slag` and call it yourself.
 *
 * @module
 */

import { installGlobals } from "./lib/global.ts";

installGlobals();
