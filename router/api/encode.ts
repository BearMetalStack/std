/**
 * @module
 * Wire encoding for the API contract layer.
 *
 * Forge validates but never serializes, so the client needs its own encoders.
 * Each one mirrors the source the router parses from - `QuerySchema` is read
 * back out of `URLSearchParams`, `FormDataSchema` out of `FormData` - so a
 * payload encoded here round-trips through `Router.handler` unchanged.
 */

import type { SchemaShape } from "../schema.ts";

const PARAM_RX = /:([A-Za-z_$][A-Za-z0-9_$]*)(\?)?/g;

/**
 * Substitutes path parameters into a route pattern.
 *
 * Values are percent-encoded, which the router reverses in `decodeGroups`.
 * Omitted optional segments collapse rather than leaving an empty segment.
 *
 * @throws if a required parameter is missing.
 */
export function buildPath(
	pattern: string,
	params: Record<string, string | number | undefined> = {},
): string {
	const filled = pattern.replace(PARAM_RX, (_match, name: string, optional?: string) => {
		const value = params[name];
		if (value === undefined || value === null || value === "") {
			if (optional) return "";
			throw new Error(`Missing required path parameter ":${name}" for "${pattern}"`);
		}
		return encodeURIComponent(String(value));
	});

	const collapsed = filled.replace(/\/{2,}/g, "/");
	return collapsed.length > 1 ? collapsed.replace(/\/$/, "") : collapsed;
}

/**
 * Encodes a plain object into `URLSearchParams`, driven by the schema shape so
 * that only declared fields are sent. Arrays become repeated keys, matching how
 * `QuerySchema` reads them back with `getAll`.
 */
export function toSearchParams(
	shape: SchemaShape,
	data: Record<string, unknown> | undefined,
): URLSearchParams {
	const params = new URLSearchParams();
	if (!data) return params;

	for (const key of Object.keys(shape)) {
		const value = data[key];
		if (value === undefined || value === null) continue;
		if (Array.isArray(value)) {
			for (const item of value) {
				if (item !== undefined && item !== null) params.append(key, String(item));
			}
		} else {
			params.append(key, String(value));
		}
	}
	return params;
}

/**
 * Encodes a plain object into `FormData`, driven by the schema shape.
 * `File` and `Blob` values are appended as-is; everything else is stringified.
 */
export function toFormData(
	shape: SchemaShape,
	data: Record<string, unknown> | undefined,
): FormData {
	const form = new FormData();
	if (!data) return form;

	for (const key of Object.keys(shape)) {
		const value = data[key];
		if (value === undefined || value === null) continue;
		if (Array.isArray(value)) {
			for (const item of value) {
				if (item !== undefined && item !== null) appendField(form, key, item);
			}
		} else {
			appendField(form, key, value);
		}
	}
	return form;
}

function appendField(form: FormData, key: string, value: unknown): void {
	if (value instanceof Blob) form.append(key, value);
	else form.append(key, String(value));
}

/**
 * Reads a response body the same way the router's `serializeBody` wrote it:
 * JSON when the content type says so, text otherwise, and `null` for the
 * statuses that carry no body.
 */
export async function readResponseBody(response: Response): Promise<unknown> {
	if (response.status === 204 || response.status === 304) return null;

	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		const text = await response.text();
		if (text === "") return null;
		return JSON.parse(text);
	}
	return await response.text();
}
