/**
 * @module
 * Resource and resource-template definition, plus the small RFC 6570 subset
 * needed to route a `resources/read` at a template.
 *
 * Supported template syntax is level 1 expansion — `{var}` matches a single
 * path segment, `{+var}` matches across `/`.
 */

import { brand, isRegistered } from "./brand.ts";
import { toResourceContents } from "./content.ts";
import type {
	RegisteredResource,
	RegisteredResourceTemplate,
	ResourceContents,
	ResourceDefinition,
	ResourceOutput,
	ResourceTemplateDefinition,
} from "./types.ts";

const VARIABLE = /\{(\+?)([A-Za-z0-9_][A-Za-z0-9_.-]*)\}/g;

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface CompiledUriTemplate {
	readonly pattern: RegExp;
	readonly variables: string[];
}

/** Compile `{var}` / `{+var}` placeholders into an anchored matcher. */
export function compileUriTemplate(template: string): CompiledUriTemplate {
	const variables: string[] = [];
	let source = "";
	let last = 0;

	for (const match of template.matchAll(VARIABLE)) {
		source += escapeRegExp(template.slice(last, match.index));
		variables.push(match[2]);
		source += match[1] === "+" ? "(.+)" : "([^/]+)";
		last = match.index + match[0].length;
	}
	source += escapeRegExp(template.slice(last));

	return { pattern: new RegExp(`^${source}$`), variables };
}

/** Match a concrete uri against a compiled template, returning its variables. */
export function matchUriTemplate(
	compiled: CompiledUriTemplate,
	uri: string,
): Record<string, string> | null {
	const match = compiled.pattern.exec(uri);
	if (!match) return null;

	const params: Record<string, string> = {};
	compiled.variables.forEach((name, index) => {
		const raw = match[index + 1] ?? "";
		try {
			params[name] = decodeURIComponent(raw);
		} catch {
			params[name] = raw;
		}
	});
	return params;
}

/** Fill a template's placeholders, percent-encoding each value. */
export function expandUriTemplate(
	template: string,
	values: Record<string, string | number>,
): string {
	return template.replace(VARIABLE, (whole, reserved: string, name: string) => {
		const value = values[name];
		if (value === undefined) return whole;
		const encoded = encodeURIComponent(String(value));
		return reserved === "+" ? encoded.replace(/%2F/gi, "/") : encoded;
	});
}

/**
 * Normalise a static resource definition. `name` defaults to the uri.
 *
 * @example
 * ```ts
 * defineResource({
 * 	uri: "config://app/settings",
 * 	mimeType: "application/json",
 * 	read: () => JSON.stringify({ theme: "dark" }),
 * });
 * ```
 */
export function defineResource(definition: ResourceDefinition): RegisteredResource {
	if (isRegistered(definition)) return definition as unknown as RegisteredResource;
	const { read, name, ...descriptor } = definition;
	return brand({ ...descriptor, name: name ?? descriptor.uri, read });
}

/**
 * Normalise a templated resource definition and precompile its uri matcher.
 *
 * @example
 * ```ts
 * defineResourceTemplate({
 * 	uriTemplate: "file:///logs/{date}.log",
 * 	name: "daily-log",
 * 	read: (ctx) => Deno.readTextFile(`./logs/${ctx.params.date}.log`),
 * });
 * ```
 */
export function defineResourceTemplate(
	definition: ResourceTemplateDefinition,
): RegisteredResourceTemplate {
	if (isRegistered(definition)) return definition as unknown as RegisteredResourceTemplate;

	const { read, list, complete, name, ...descriptor } = definition;
	const compiled = compileUriTemplate(descriptor.uriTemplate);

	const template: RegisteredResourceTemplate = {
		...descriptor,
		name: name ?? descriptor.uriTemplate,
		read,
		match: (uri: string) => matchUriTemplate(compiled, uri),
	};
	if (list) Object.assign(template, { list });
	if (complete) Object.assign(template, { complete });
	return brand(template);
}

/** Coerce whatever a reader returned into the `resources/read` result shape. */
export function normalizeResourceContents(
	uri: string,
	output: ResourceOutput,
	mimeType?: string,
): ResourceContents[] {
	if (typeof output === "string" || output instanceof Uint8Array) {
		return [toResourceContents(uri, output, mimeType)];
	}
	if (Array.isArray(output)) {
		return output.map((entry) => toResourceContents(uri, entry, mimeType));
	}
	if ("contents" in output && Array.isArray(output.contents)) {
		return output.contents.map((entry) => toResourceContents(uri, entry, mimeType));
	}
	return [toResourceContents(uri, output as ResourceContents, mimeType)];
}
