/**
 * @module
 * Prompt definition and result normalisation.
 *
 * Prompt arguments arrive from the client as strings, so an `argumentSchema`
 * should describe string-shaped fields; its JSON Schema form is what produces
 * the `arguments` list clients see in `prompts/list`.
 */

import type { JSONSchema, Schema } from "@bearmetal/forge";
import { brand, isRegistered } from "./brand.ts";
import { isContentBlock, text } from "./content.ts";
import { isSchema } from "./tools.ts";
import type {
	PromptArgumentDescriptor,
	PromptDefinition,
	PromptHandler,
	PromptMessage,
	PromptOutput,
	PromptResult,
	RawPromptDefinition,
	RegisteredPrompt,
	TypedPromptDefinition,
} from "./types.ts";

/** Derive `prompts/list` argument descriptors from an object JSON Schema. */
export function argumentsFromJsonSchema(schema: JSONSchema): PromptArgumentDescriptor[] {
	const required = new Set(schema.required ?? []);
	return Object.entries(schema.properties ?? {}).map(([name, property]) => {
		const argument: PromptArgumentDescriptor = { name };
		if (property.description !== undefined) argument.description = property.description;
		if (required.has(name)) argument.required = true;
		return argument;
	});
}

/**
 * Normalise a prompt definition into its registered form.
 *
 * @example
 * ```ts
 * definePrompt({
 * 	name: "review",
 * 	description: "Review a diff",
 * 	arguments: [{ name: "diff", required: true }],
 * 	handler: ({ diff }) => `Please review:\n\n${diff}`,
 * });
 * ```
 */
export function definePrompt<S extends Schema<Record<string, unknown>>>(
	definition: TypedPromptDefinition<S>,
): RegisteredPrompt;
export function definePrompt(definition: RawPromptDefinition): RegisteredPrompt;
export function definePrompt(definition: PromptDefinition): RegisteredPrompt {
	if (isRegistered(definition)) return definition as unknown as RegisteredPrompt;

	const { argumentSchema } = definition as TypedPromptDefinition<Schema<Record<string, unknown>>>;

	const prompt: RegisteredPrompt = {
		name: definition.name,
		handler: definition.handler as PromptHandler,
	};

	if (definition.title !== undefined) prompt.title = definition.title;
	if (definition.description !== undefined) prompt.description = definition.description;
	if (definition._meta !== undefined) prompt._meta = definition._meta;
	if (definition.complete !== undefined) Object.assign(prompt, { complete: definition.complete });

	if (isSchema(argumentSchema)) {
		prompt.arguments = argumentsFromJsonSchema(argumentSchema.toJSONSchema());
		Object.assign(prompt, {
			parseArgs: (args: Record<string, unknown>) =>
				argumentSchema.parse(args) as Record<string, unknown>,
		});
	} else {
		const raw = (definition as RawPromptDefinition).arguments;
		if (raw !== undefined) prompt.arguments = raw;
	}

	return brand(prompt);
}

function toMessage(value: unknown): PromptMessage {
	if (typeof value === "string") return { role: "user", content: text(value) };
	if (isContentBlock(value)) return { role: "user", content: value };
	const message = value as PromptMessage;
	return {
		role: message.role ?? "user",
		content: typeof message.content === "string" ? text(message.content) : message.content,
	};
}

/** Coerce whatever a prompt handler returned into the `prompts/get` result shape. */
export function normalizePromptResult(output: PromptOutput): PromptResult {
	if (typeof output === "string" || isContentBlock(output)) {
		return { messages: [toMessage(output)] };
	}
	if (Array.isArray(output)) return { messages: output.map(toMessage) };

	const candidate = output as Partial<PromptResult> & Partial<PromptMessage>;
	if (Array.isArray(candidate.messages)) {
		const result: PromptResult = { messages: candidate.messages.map(toMessage) };
		if (candidate.description !== undefined) result.description = candidate.description;
		if (candidate._meta !== undefined) result._meta = candidate._meta;
		return result;
	}
	return { messages: [toMessage(output)] };
}
