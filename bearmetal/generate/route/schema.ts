/**
 * Parsing for the `--body-schema` and `--response-schema` flags.
 *
 * The forge schema generator does not exist yet, so this is the hook the route
 * generator offers in the meantime: point at a schema that already lives
 * somewhere in the project and it will be imported and wired into the route.
 *
 * - body:     `<path>:<export>`               e.g. `schemas.ts:user`
 * - response: `[<status>:]<path>:<export>`     e.g. `200:response/schemas.ts:ok`
 *
 * The path is always relative to the project root; the generator rewrites it to
 * a specifier relative to the route file that ends up importing it.
 *
 * @module
 */

import type { ResponseSchemaRef, SchemaRef } from "./types.ts";

/** Parses a `<path>:<export>` body-schema spec. */
export function parseBodySchema(spec: string): SchemaRef {
	const { module, name } = splitModuleAndName(spec, "--body-schema");
	return { module, name };
}

/**
 * Parses a `[<status>:]<path>:<export>` response-schema spec. A spec with no
 * status defaults to `200`.
 */
export function parseResponseSchema(spec: string): ResponseSchemaRef {
	const parts = spec.split(":");
	if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
		const status = Number(parts[0]);
		assertStatus(status, spec);
		const { module, name } = splitModuleAndName(parts.slice(1).join(":"), "--response-schema");
		return { status, module, name };
	}
	const { module, name } = splitModuleAndName(spec, "--response-schema");
	return { status: 200, module, name };
}

/** Splits `<path>:<export>` on its final colon, validating both halves. */
function splitModuleAndName(spec: string, flag: string): SchemaRef {
	const at = spec.lastIndexOf(":");
	if (at <= 0 || at === spec.length - 1) {
		throw new Error(
			`${flag} expects "<path>:<export>" (e.g. schemas.ts:user), got "${spec}"`,
		);
	}
	const module = spec.slice(0, at).trim();
	const name = spec.slice(at + 1).trim();
	if (!module || !name) {
		throw new Error(
			`${flag} expects "<path>:<export>" (e.g. schemas.ts:user), got "${spec}"`,
		);
	}
	return { module, name };
}

function assertStatus(status: number, spec: string): void {
	if (!Number.isInteger(status) || status < 100 || status > 599) {
		throw new Error(
			`--response-schema status must be between 100 and 599, got "${status}" in "${spec}"`,
		);
	}
}
