/**
 * @module
 * A non-enumerable marker used to make the `define*` helpers idempotent, so
 * passing an already-defined registration back through one is a no-op instead
 * of silently dropping its validators.
 */

/** Registered via the global symbol registry so separate copies agree. */
export const REGISTERED: symbol = Symbol.for("@bearmetal/mcp.registered");

/** Mark a value as already normalised. Non-enumerable, so it never serialises. */
export function brand<T extends object>(value: T): T {
	Object.defineProperty(value, REGISTERED, { value: true, enumerable: false });
	return value;
}

export function isRegistered(value: unknown): boolean {
	return typeof value === "object" && value !== null && REGISTERED in value;
}
