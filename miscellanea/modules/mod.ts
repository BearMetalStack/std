/**
 * Runtime environment detection — client (browser) vs. server.
 * @module
 */

/** Returns `true` when running in a browser (i.e. `document` is present). */
export function isClient(): boolean {
  if (typeof globalThis["document"] !== "undefined") return true;
  return false;
}

/** Throws if the current environment is not a browser. */
export function throwIfNotClient(moduleName?: string): void {
  if (!isClient()) {
    throw new Error(
      moduleName ? `${moduleName} is a client only module` : "Not a client",
    );
  }
}

/** Throws if the current environment is a browser or Deno (targets Node/Bun). */
export function throwIfNotServer(moduleName?: string): void {
  if (isClient() || typeof globalThis["Deno"] !== "undefined") {
    throw new Error(
      moduleName ? `${moduleName} is a server only module` : "Not a server",
    );
  }
}
