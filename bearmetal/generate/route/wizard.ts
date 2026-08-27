/**
 * The interactive route-generation wizard.
 *
 * It is handed whatever flags were already given and only asks for what is still
 * missing, so `generate route` with no arguments walks through everything while
 * `generate route --path=/x -R` fills the rest in silently.
 *
 * @module
 */

import { cliConfirm, cliPrompt, colorize, multiSelectMenuInteractive } from "@bearmetal/cli";
import { BODY_METHODS, type Method, METHODS, type RouteRequest } from "./types.ts";
import { defaultFilename, validatePath } from "./path.ts";
import { parseBodySchema, parseResponseSchema } from "./schema.ts";
import type { PartialRequest } from "./command.ts";

/** Fills a {@link PartialRequest} into a complete {@link RouteRequest} by prompting. */
export async function runWizard(partial: PartialRequest): Promise<RouteRequest> {
	const path = validatePath(await askPath(partial.path));
	const methods = partial.methods.length > 0 ? partial.methods : await askMethods();
	const shorthand = await askShorthand(partial.shorthand, methods);
	const filename = await askFilename(partial.filename, path);
	const bodySchema = partial.bodySchema ?? await askBodySchema(methods);
	const responseSchemas = partial.responseSchemas.length > 0
		? partial.responseSchemas
		: await askResponseSchemas();

	return { path, methods, bodySchema, responseSchemas, shorthand, filename };
}

async function askPath(current: string | undefined): Promise<string> {
	if (current) return current;
	return await cliPrompt("Route path", {
		validate: (value) => {
			try {
				validatePath(value);
				return null;
			} catch (e) {
				return e instanceof Error ? e.message : String(e);
			}
		},
	});
}

async function askMethods(): Promise<Method[]> {
	const chosen = await multiSelectMenuInteractive(
		"Which methods should this route handle?",
		METHODS.map((m) => m.toUpperCase()),
	);
	const picked = (chosen ?? [])
		.map((label) => label.toLowerCase() as Method)
		.filter((m): m is Method => METHODS.includes(m));
	if (picked.length === 0) {
		console.log(colorize("No method selected; defaulting to GET.", "gray"));
		return ["get"];
	}
	return METHODS.filter((m) => picked.includes(m));
}

async function askShorthand(current: boolean, methods: Method[]): Promise<boolean> {
	if (current) return true;
	if (methods.length !== 1) return false;
	return await cliConfirm(
		`Restrict this route to only ${methods[0].toUpperCase()} (shorthand form)?`,
		false,
	);
}

async function askFilename(current: string | undefined, path: string): Promise<string | undefined> {
	if (current) return current;
	const suggested = defaultFilename(path);
	const answer = await cliPrompt("Filename for the route file", { default: suggested });
	return answer && answer !== suggested ? answer : undefined;
}

async function askBodySchema(methods: Method[]) {
	if (!methods.some((m) => BODY_METHODS.includes(m))) return undefined;
	if (!(await cliConfirm("Add a request body schema?", false))) return undefined;
	const spec = await cliPrompt("Body schema (<path>:<export>)", {
		validate: (value) => tryParse(() => parseBodySchema(value)),
	});
	return parseBodySchema(spec);
}

async function askResponseSchemas() {
	if (!(await cliConfirm("Add response schema(s)?", false))) return [];
	const responses = [];
	let more = true;
	while (more) {
		const spec = await cliPrompt("Response schema ([status:]<path>:<export>)", {
			validate: (value) => tryParse(() => parseResponseSchema(value)),
		});
		responses.push(parseResponseSchema(spec));
		more = await cliConfirm("Add another response schema?", false);
	}
	return responses;
}

function tryParse(fn: () => unknown): string | null {
	try {
		fn();
		return null;
	} catch (e) {
		return e instanceof Error ? e.message : String(e);
	}
}
