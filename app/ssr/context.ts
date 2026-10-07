/**
 * The per-render values a server render scopes to its own call stack.
 *
 * Its own module because both halves of the seam need the key and neither
 * should have to import the other: the renderer writes it (`./render.ts`, which
 * pulls in the microdom) and the router reads it
 * (`../built-ins/router/location.ts`, which ships to the browser).
 */

/**
 * Context key holding the URL the current server render is for.
 *
 * A `string`, or `undefined` when the renderer was not told which URL it was
 * rendering. Read it with `getContextItemOrDefault`, never the throwing `ctx`
 * proxy — being outside a server render is the normal case.
 */
export const RENDER_URL = "bearmetal.ssr.url";

/**
 * Router state a middleware writes to scope values into the page it is about
 * to render. `Page()` passes `renderContext` to the renderer as
 * `RenderOptions.context`, so a component reads each entry with
 * `getContextItemOrDefault(key, fallback)`.
 *
 * Merge into it rather than replacing it — more than one middleware may be
 * contributing — and namespace the keys, as {@linkcode RENDER_URL} is.
 *
 * @example
 * ```ts
 * router.use((ctx, next) => {
 *   ctx.state.renderContext = { ...ctx.state.renderContext, "my.locale": "en-GB" };
 *   return next();
 * });
 * ```
 */
export interface RenderContextState {
	renderContext?: Record<string, unknown>;
}
