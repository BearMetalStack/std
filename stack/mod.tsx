/**
 * `@bearmetal/stack`: the `deno create jsr:@bearmetal/stack` scaffolding
 * CLI/wizard.
 *
 * SSR, bundling, and component/app/page discovery are owned by
 * `@bearmetal/app` (see `@bearmetal/app/serve`'s `appModule()`) - this
 * package only assembles a new project. What's left here is the wizard's
 * own leftovers: the Google Fonts helper the scaffolded template embeds.
 *
 * @module
 */

export * from "./optimization/fonts/google.tsx";
export type * from "./types.ts";
