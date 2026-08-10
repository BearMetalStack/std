/**
 * @module
 * Tool definition and result normalisation.
 *
 * `inputSchema` accepts either a forge schema — in which case arguments are
 * validated and typed for the handler — or a hand-written JSON Schema.
 */

import type { JSONSchema, Schema } from "@bearmetal/forge";
import { brand, isRegistered } from "./brand.ts";
import { isContentBlock, json, text } from "./content.ts";
import type {
	ContentBlock,
	RawToolDefinition,
	RegisteredTool,
	ToolDefinition,
	ToolHandler,
	ToolOutput,
	ToolResult,
	TypedToolDefinition,
} from "./types.ts";

/** Duck-typed forge schema check, so schemas from another copy of forge still work. */
export function isSchema(value: unknown): value is Schema<unknown> {
	return typeof value === "object" && value !== null &&
		typeof (value as Schema<unknown>).toJSONSchema === "function" &&
		typeof (value as Schema<unknown>).safeParse === "function";
}

const EMPTY_OBJECT_SCHEMA: JSONSchema = { type: "object", properties: {} };

/** MCP requires tool schemas to be object-typed; fill in the parts that are missing. */
function asObjectSchema(schema: JSONSchema | undefined): JSONSchema {
	if (!schema) return { ...EMPTY_OBJECT_SCHEMA };
	return schema.type ? schema : { ...schema, type: "object" };
}

/**
 * Normalise a tool definition into its registered form: JSON Schema for the
 * wire, plus validators for the handler boundary.
 *
 * @example
 * ```ts
 * const greet = defineTool({
 * 	name: "greet",
 * 	description: "Greet somebody by name",
 * 	inputSchema: s.object({ name: s.string() }),
 * 	handler: ({ name }) => `Hello, ${name}!`,
 * });
 * ```
 */
export function defineTool<S extends Schema<Record<string, unknown>>>(
	definition: TypedToolDefinition<S>,
): RegisteredTool;
export function defineTool(definition: RawToolDefinition): RegisteredTool;
export function defineTool(definition: ToolDefinition): RegisteredTool {
	if (isRegistered(definition)) return definition as unknown as RegisteredTool;

	const { inputSchema, outputSchema } = definition as RawToolDefinition & {
		inputSchema?: Schema<Record<string, unknown>> | JSONSchema;
	};

	const tool: RegisteredTool = {
		name: definition.name,
		inputSchema: asObjectSchema(
			isSchema(inputSchema) ? inputSchema.toJSONSchema() : inputSchema,
		),
		handler: definition.handler as ToolHandler,
	};

	if (definition.title !== undefined) tool.title = definition.title;
	if (definition.description !== undefined) tool.description = definition.description;
	if (definition.annotations !== undefined) tool.annotations = definition.annotations;
	if (definition._meta !== undefined) tool._meta = definition._meta;

	if (isSchema(inputSchema)) {
		Object.assign(tool, {
			parseInput: (args: Record<string, unknown>) =>
				inputSchema.parse(args) as Record<string, unknown>,
		});
	}

	if (outputSchema !== undefined) {
		const schema = isSchema(outputSchema) ? outputSchema.toJSONSchema() : outputSchema;
		tool.outputSchema = asObjectSchema(schema);
		if (isSchema(outputSchema)) {
			Object.assign(tool, { parseOutput: (value: unknown) => outputSchema.parse(value) });
		}
	}

	return brand(tool);
}

function toContentBlocks(values: readonly unknown[]): ContentBlock[] {
	return values.map((value) => {
		if (typeof value === "string") return text(value);
		if (isContentBlock(value)) return value;
		return json(value);
	});
}

/**
 * Coerce whatever a handler returned into the `tools/call` result shape.
 *
 * A string becomes one text block, an array becomes the content list, and a
 * plain object becomes `structuredContent` mirrored into a JSON text block —
 * clients that ignore structured output still see the payload.
 */
export function normalizeToolResult(output: ToolOutput): ToolResult {
	if (output === undefined || output === null) return { content: [] };
	if (typeof output === "string") return { content: [text(output)] };
	if (Array.isArray(output)) return { content: toContentBlocks(output) };
	if (isContentBlock(output)) return { content: [output] };

	const candidate = output as Partial<ToolResult> & Record<string, unknown>;
	const isToolResult = Array.isArray(candidate.content) ||
		(candidate.structuredContent !== undefined && candidate.content === undefined);

	if (!isToolResult) {
		const structured = output as Record<string, unknown>;
		return { content: [json(structured)], structuredContent: structured };
	}

	const result: ToolResult = {
		content: Array.isArray(candidate.content) ? toContentBlocks(candidate.content) : [],
	};
	if (candidate.structuredContent !== undefined) {
		result.structuredContent = candidate.structuredContent;
		if (result.content.length === 0) result.content = [json(candidate.structuredContent)];
	}
	if (candidate.isError !== undefined) result.isError = candidate.isError;
	if (candidate._meta !== undefined) result._meta = candidate._meta;
	return result;
}

/** Build the `isError` result the spec asks for when a tool throws. */
export function toolErrorResult(error: unknown): ToolResult {
	const message = error instanceof Error ? error.message : String(error);
	return { content: [text(message)], isError: true };
}
