/**
 * @module
 * Permission-safe environment access. Reading an unset variable and reading a
 * variable without `--allow-env` should both mean "den doesn't know", not
 * "crash the program", so every lookup here fails soft.
 */

import type { EnvReader } from "./types.ts";

/**
 * Reads `Deno.env`, yielding `undefined` for anything unset, unpermitted, or
 * unavailable (a browser, a worker without env access).
 */
export const readEnv: EnvReader = (key: string): string | undefined => {
	if (!("Deno" in globalThis) || typeof Deno?.env?.get !== "function") return undefined;
	try {
		return Deno.env.get(key) || undefined;
	} catch {
		return undefined;
	}
};

/** The first of `keys` that resolves to a non-empty value. */
export function firstEnv(env: EnvReader, ...keys: string[]): string | undefined {
	for (const key of keys) {
		const value = env(key);
		if (value) return value;
	}
	return undefined;
}
