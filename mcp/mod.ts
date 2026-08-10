/**
 * @module
 * BearMetal MCP — a zero-dependency Model Context Protocol server for Deno.
 *
 * The primary API is {@linkcode McpServer} plus a {@linkcode Transport}:
 *
 * ```ts
 * import { McpServer, StdioTransport } from "@bearmetal/mcp";
 * import { s } from "@bearmetal/forge";
 *
 * const server = new McpServer({ serverInfo: { name: "demo", version: "1.0.0" } });
 *
 * server.addTool({
 * 	name: "add",
 * 	description: "Add two numbers",
 * 	inputSchema: s.object({ a: s.number(), b: s.number() }),
 * 	handler: ({ a, b }) => String(a + b),
 * });
 *
 * await server.connect(new StdioTransport());
 * ```
 *
 * For a quick script there is a process-wide default server behind
 * {@linkcode addTools}, {@linkcode addResources}, {@linkcode addPrompts} and
 * {@linkcode startMCP}.
 */

import { McpServer } from "./server.ts";
import { StdioTransport } from "./transport.ts";
import * as content from "./content.ts";
import type {
	McpServerOptions,
	PromptDefinition,
	RegisteredPrompt,
	RegisteredResource,
	RegisteredResourceTemplate,
	RegisteredTool,
	ResourceDefinition,
	ResourceTemplateDefinition,
	ServerCapabilities,
	ServerInfo,
	ToolDefinition,
} from "./types.ts";

export * from "./types.ts";

export { LATEST_PROTOCOL_VERSION, McpServer, SUPPORTED_PROTOCOL_VERSIONS } from "./server.ts";
export { Registry, type RegistryEntry } from "./registry.ts";
export { ErrorCode, RpcError } from "./jsonrpc.ts";
export { logToStderr, MemoryTransport, StdioTransport } from "./transport.ts";
export { defineTool, isSchema, normalizeToolResult, toolErrorResult } from "./tools.ts";
export {
	type CompiledUriTemplate,
	compileUriTemplate,
	defineResource,
	defineResourceTemplate,
	expandUriTemplate,
	matchUriTemplate,
	normalizeResourceContents,
} from "./resources.ts";
export { argumentsFromJsonSchema, definePrompt, normalizePromptResult } from "./prompts.ts";
export {
	audio,
	embeddedResource,
	fromBase64,
	image,
	isContentBlock,
	json,
	resourceLink,
	text,
	toBase64,
	toResourceContents,
} from "./content.ts";

/** The content-block builders, grouped for callers who prefer a namespace. */
export { content };

/** Construct a server. Equivalent to `new McpServer(options)`. */
export function createServer(options?: McpServerOptions): McpServer {
	return new McpServer(options);
}

// ─── Default server ───────────────────────────────────────────────────────────

let defaultServer: McpServer | null = null;

/**
 * The process-wide default server, created on first use. Handy for
 * single-file servers; prefer an explicit {@linkcode McpServer} in a library.
 */
export function server(): McpServer {
	return defaultServer ??= new McpServer();
}

/** Replace the default server, e.g. to pass constructor options. */
export function setDefaultServer(instance: McpServer): McpServer {
	defaultServer = instance;
	return instance;
}

export function defineServerInfo(info: ServerInfo): void {
	server().setServerInfo(info);
}

export function getServerInfo(): ServerInfo {
	return server().serverInfo;
}

/** Merge extra capabilities over the ones derived from what is registered. */
export function defineCapabilities(capabilities: ServerCapabilities): void {
	server().setCapabilities(capabilities);
}

export function addTools(...tools: (ToolDefinition | RegisteredTool)[]): void {
	server().addTools(...tools);
}

export function addResources(...resources: (ResourceDefinition | RegisteredResource)[]): void {
	server().addResources(...resources);
}

export function addResourceTemplates(
	...templates: (ResourceTemplateDefinition | RegisteredResourceTemplate)[]
): void {
	server().addResourceTemplates(...templates);
}

export function addPrompts(...prompts: (PromptDefinition | RegisteredPrompt)[]): void {
	server().addPrompts(...prompts);
}

/**
 * Serve the default server over stdio until the client closes the connection.
 *
 * Nothing may be written to stdout while this runs — use
 * {@linkcode logToStderr} or `server().log(...)` for diagnostics.
 */
export function startMCP(): Promise<void> {
	return server().connect(new StdioTransport());
}
