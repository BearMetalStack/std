/**
 * The automatic-runtime entry point: `jsx`, `jsxs`, `Fragment`.
 *
 * There is one of these. It used to pick a client or a server half from
 * `typeof document` at import time, which made the choice depend on module
 * evaluation order — and a `.tsx` file could never win that race, because the
 * transform injects this import above anything the source itself writes.
 *
 * Now the runtime builds DOM nodes unconditionally and lets whichever
 * `document` it finds decide what that means: a browser's, or
 * `@bearmetal/slag`'s. Point `jsxImportSource` at `@bearmetal/jsx` and that is
 * the whole configuration, wherever the code runs.
 *
 * @module
 */

export {
	flatChildren,
	Fragment,
	getCurrentOwner,
	type HtmlLike,
	jsx,
	jsxs,
	type Owner,
	setCurrentOwner,
	setEffectImpl,
	setUntrackImpl,
} from "./lib/jsx.ts";
export { isServerRendering, trackPending } from "./lib/pending.ts";
export type * from "./types.ts";
