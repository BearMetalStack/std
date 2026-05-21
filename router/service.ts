/**
 * @module
 * Service factory utilities for BearMetal Router
 */

import type { Service, ServiceActions, ServiceToken } from "./types.ts";

/**
 * Create a typed service token — a branded string that carries action types
 * so `ctx.getService()` can infer them without an explicit type parameter.
 *
 * @example
 * ```ts
 * export const emailToken = createServiceToken<{
 *   send: (to: string, body: string) => Promise<void>;
 * }>("email");
 *
 * router.registerService(emailToken, emailService);
 * ctx.getService(emailToken).invoke("send", "a@b.com", "hi"); // fully typed
 * ```
 */
export function createServiceToken<T extends ServiceActions>(
  name: string,
): ServiceToken<T> {
  return name as ServiceToken<T>;
}

/**
 * Build a `Service<T>` from a plain object of action functions.
 * TypeScript infers `T` from the object, so `invoke` is fully typed.
 *
 * @example
 * ```ts
 * export const emailService = createService({
 *   send: async (to: string, body: string) => { ... },
 *   verify: (address: string) => checkMx(address),
 * });
 * ```
 */
export function createService<T extends ServiceActions>(actions: T): Service<T> {
  return {
    invoke(action, ...args) {
      const fn = actions[action];
      if (!fn) throw new Error(`Action "${String(action)}" not found on service`);
      return fn(...args) as ReturnType<T[typeof action]>;
    },
  };
}
