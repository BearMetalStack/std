/**
 * @module Helpers for whatever was thrown
 */

/**
 * A human-readable string for anything that was thrown: an `Error`'s (or error-like object's)
 * non-empty `message`, otherwise `String(e)`.
 *
 * ```ts
 * try { await save(); } catch (e) { toast(messageOf(e)); }
 * ```
 */
export function messageOf(e: unknown): string {
	if (e !== null && typeof e === "object" && "message" in e) {
		const { message } = e as { message: unknown };
		if (typeof message === "string" && message) return message;
	}
	if (typeof e === "string") return e;
	try {
		return String(e);
	} catch {
		return Object.prototype.toString.call(e);
	}
}
