/**
 * @module
 * Public types for `@bearmetal/mcp` — the JSON-RPC envelope, the Model Context
 * Protocol wire shapes, and the registration/handler types the server exposes.
 */

import type { JSONSchema, Schema } from "@bearmetal/forge";
import type { McpServer } from "./server.ts";

export type { JSONSchema };

// ─── JSON-RPC 2.0 ─────────────────────────────────────────────────────────────

/** A JSON-RPC id. The protocol forbids `null` ids on requests. */
export type JsonRpcId = string | number;

export interface JsonRpcErrorBody {
	code: number;
	message: string;
	data?: unknown;
}

export interface JsonRpcRequest {
	jsonrpc: "2.0";
	id: JsonRpcId;
	method: string;
	params?: Record<string, unknown>;
}

export interface JsonRpcNotification {
	jsonrpc: "2.0";
	method: string;
	params?: Record<string, unknown>;
}

export interface JsonRpcSuccess {
	jsonrpc: "2.0";
	id: JsonRpcId;
	result: Record<string, unknown>;
}

export interface JsonRpcFailure {
	jsonrpc: "2.0";
	/** `null` only when the offending message could not be parsed. */
	id: JsonRpcId | null;
	error: JsonRpcErrorBody;
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

// ─── Transport ────────────────────────────────────────────────────────────────

/** Receives every well-formed message the peer sends. */
export type MessageHandler = (message: JsonRpcMessage) => void | Promise<void>;

/**
 * A bidirectional MCP message channel. `StdioTransport` is the only
 * implementation shipped today; the interface exists so an HTTP transport can
 * drop in without touching {@linkcode McpServer}.
 */
export interface Transport {
	/** Begin delivering messages. Resolves once the channel is live. */
	start(handler: MessageHandler): void | Promise<void>;
	/** Deliver a single message to the peer. */
	send(message: JsonRpcMessage): void | Promise<void>;
	/** Stop the channel. Idempotent. */
	close(): void | Promise<void>;
	/** Resolves when the channel is finished, whether locally or remotely closed. */
	readonly closed: Promise<void>;
	/**
	 * Assigned by the server when it connects. Called for anything received that
	 * is not a well-formed JSON-RPC message, so a parse error can be reported.
	 */
	onInvalid?: (raw: string, error: unknown) => void;
}

// ─── Shared primitives ────────────────────────────────────────────────────────

export type Role = "user" | "assistant";

export interface Annotations {
	audience?: Role[];
	/** 0 (least important) to 1 (most important). */
	priority?: number;
	lastModified?: string;
}

export interface Implementation {
	name: string;
	version: string;
	title?: string;
}

/** Identifying information for this server, returned from `initialize`. */
export type ServerInfo = Implementation;

/** Identifying information the client sent during `initialize`. */
export type ClientInfo = Implementation;

export type LoggingLevel =
	| "debug"
	| "info"
	| "notice"
	| "warning"
	| "error"
	| "critical"
	| "alert"
	| "emergency";

// ─── Capabilities ─────────────────────────────────────────────────────────────

export interface ServerCapabilities {
	logging?: Record<string, unknown>;
	completions?: Record<string, unknown>;
	prompts?: { listChanged?: boolean };
	resources?: { subscribe?: boolean; listChanged?: boolean };
	tools?: { listChanged?: boolean };
	experimental?: Record<string, Record<string, unknown>>;
}

export interface ClientCapabilities {
	roots?: { listChanged?: boolean };
	sampling?: Record<string, unknown>;
	elicitation?: Record<string, unknown>;
	experimental?: Record<string, Record<string, unknown>>;
}

/** What the peer told us about itself during `initialize`. */
export interface ClientSnapshot {
	info: ClientInfo;
	capabilities: ClientCapabilities;
	protocolVersion: string;
}

// ─── Content blocks ───────────────────────────────────────────────────────────

export interface TextContent {
	type: "text";
	text: string;
	annotations?: Annotations;
	_meta?: Record<string, unknown>;
}

export interface ImageContent {
	type: "image";
	/** base64-encoded image data. */
	data: string;
	mimeType: string;
	annotations?: Annotations;
	_meta?: Record<string, unknown>;
}

export interface AudioContent {
	type: "audio";
	/** base64-encoded audio data. */
	data: string;
	mimeType: string;
	annotations?: Annotations;
	_meta?: Record<string, unknown>;
}

export interface ResourceLink {
	type: "resource_link";
	uri: string;
	name: string;
	title?: string;
	description?: string;
	mimeType?: string;
	annotations?: Annotations;
	_meta?: Record<string, unknown>;
}

export interface EmbeddedResource {
	type: "resource";
	resource: ResourceContents;
	annotations?: Annotations;
	_meta?: Record<string, unknown>;
}

export type ContentBlock =
	| TextContent
	| ImageContent
	| AudioContent
	| ResourceLink
	| EmbeddedResource;

export interface TextResourceContents {
	uri: string;
	mimeType?: string;
	text: string;
	_meta?: Record<string, unknown>;
}

export interface BlobResourceContents {
	uri: string;
	mimeType?: string;
	/** base64-encoded binary data. */
	blob: string;
	_meta?: Record<string, unknown>;
}

export type ResourceContents = TextResourceContents | BlobResourceContents;

// ─── Request context ──────────────────────────────────────────────────────────

/**
 * Handed to every handler. Carries who is asking, how to talk back to them
 * mid-flight, and a signal that aborts when the client cancels the request.
 */
export interface RequestContext {
	readonly server: McpServer;
	/** The JSON-RPC method being served, e.g. `"tools/call"`. */
	readonly method: string;
	readonly requestId: JsonRpcId;
	/** Aborts on `notifications/cancelled` or when the transport closes. */
	readonly signal: AbortSignal;
	/** `null` until `initialize` has completed. */
	readonly client: ClientSnapshot | null;
	/** The request's `_meta`, if it carried one. */
	readonly meta?: Record<string, unknown>;
	/** No-op unless the client supplied a `progressToken`. */
	progress(progress: number, total?: number, message?: string): void;
	/** Emits `notifications/message`, subject to the client's logging level. */
	log(level: LoggingLevel, data: unknown, logger?: string): void;
}

// ─── Registration: visibility ─────────────────────────────────────────────────

/** Passed to per-entry `visible` predicates when a list is assembled. */
export interface VisibilityContext {
	readonly server: McpServer;
	readonly client: ClientSnapshot | null;
	readonly method: string;
}

export interface RegistrationOptions {
	/** Registered but hidden and un-callable while `false`. Defaults to `true`. */
	enabled?: boolean;
	/** Called per list/lookup; `false` hides the entry from this client. */
	visible?: (ctx: VisibilityContext) => boolean;
}

// ─── Tools ────────────────────────────────────────────────────────────────────

export interface ToolAnnotations {
	title?: string;
	readOnlyHint?: boolean;
	destructiveHint?: boolean;
	idempotentHint?: boolean;
	openWorldHint?: boolean;
}

/** The wire shape of a tool as returned by `tools/list`. */
export interface ToolDescriptor {
	name: string;
	title?: string;
	description?: string;
	inputSchema: JSONSchema;
	outputSchema?: JSONSchema;
	annotations?: ToolAnnotations;
	_meta?: Record<string, unknown>;
}

export interface ToolResult {
	content: ContentBlock[];
	structuredContent?: Record<string, unknown>;
	isError?: boolean;
	_meta?: Record<string, unknown>;
}

/**
 * What a tool handler may return. Strings become a single text block, a bare
 * object becomes `structuredContent`, and `void` becomes an empty result.
 */
export type ToolOutput =
	| void
	| string
	| ContentBlock
	| ContentBlock[]
	| ToolResult
	| Record<string, unknown>;

export type ToolHandler<A = Record<string, unknown>> = (
	args: A,
	ctx: RequestContext,
) => ToolOutput | Promise<ToolOutput>;

export interface ToolDefinitionBase {
	name: string;
	title?: string;
	description?: string;
	outputSchema?: Schema<unknown> | JSONSchema;
	annotations?: ToolAnnotations;
	_meta?: Record<string, unknown>;
}

/** A tool whose arguments are described (and validated) by a forge schema. */
export interface TypedToolDefinition<S extends Schema<Record<string, unknown>>>
	extends ToolDefinitionBase {
	inputSchema: S;
	handler: ToolHandler<S["_output"]>;
}

/** A tool whose arguments are described by a hand-written JSON Schema. */
export interface RawToolDefinition extends ToolDefinitionBase {
	inputSchema?: JSONSchema;
	handler: ToolHandler;
}

export type ToolDefinition =
	| TypedToolDefinition<Schema<Record<string, unknown>>>
	| RawToolDefinition;

/** A tool after {@linkcode defineTool} has normalised its schemas. */
export interface RegisteredTool extends ToolDescriptor {
	/** Validates and coerces raw arguments. Throws `SchemaError` on mismatch. */
	readonly parseInput?: (args: Record<string, unknown>) => Record<string, unknown>;
	readonly parseOutput?: (value: unknown) => unknown;
	readonly handler: ToolHandler;
}

// ─── Resources ────────────────────────────────────────────────────────────────

/** The wire shape of a resource as returned by `resources/list`. */
export interface ResourceDescriptor {
	uri: string;
	name: string;
	title?: string;
	description?: string;
	mimeType?: string;
	size?: number;
	annotations?: Annotations;
	_meta?: Record<string, unknown>;
}

export interface ResourceTemplateDescriptor {
	uriTemplate: string;
	name: string;
	title?: string;
	description?: string;
	mimeType?: string;
	annotations?: Annotations;
	_meta?: Record<string, unknown>;
}

/**
 * What a reader may return. Strings and byte arrays are wrapped into a single
 * `contents` entry carrying the resource's own uri and mime type.
 */
export type ResourceOutput =
	| string
	| Uint8Array
	| ResourceContents
	| ResourceContents[]
	| { contents: ResourceContents[] };

export type ResourceReader = (
	ctx: ResourceRequestContext,
) => ResourceOutput | Promise<ResourceOutput>;

export interface ResourceRequestContext extends RequestContext {
	/** The uri actually requested. */
	readonly uri: string;
	/** Variables captured from a template's uri, empty for static resources. */
	readonly params: Record<string, string>;
}

export interface ResourceDefinition extends Omit<ResourceDescriptor, "name"> {
	name?: string;
	read: ResourceReader;
}

export interface ResourceTemplateDefinition extends Omit<ResourceTemplateDescriptor, "name"> {
	name?: string;
	read: ResourceReader;
	/** Optional expansion of the template into concrete resources for `resources/list`. */
	list?: (ctx: VisibilityContext) => ResourceDescriptor[] | Promise<ResourceDescriptor[]>;
	/** Argument completions keyed by template variable name. */
	complete?: CompletionMap;
}

export interface RegisteredResource extends ResourceDescriptor {
	readonly read: ResourceReader;
}

export interface RegisteredResourceTemplate extends ResourceTemplateDescriptor {
	readonly read: ResourceReader;
	readonly list?: (ctx: VisibilityContext) => ResourceDescriptor[] | Promise<ResourceDescriptor[]>;
	readonly complete?: CompletionMap;
	readonly match: (uri: string) => Record<string, string> | null;
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

export interface PromptArgumentDescriptor {
	name: string;
	description?: string;
	required?: boolean;
	title?: string;
}

export interface PromptDescriptor {
	name: string;
	title?: string;
	description?: string;
	arguments?: PromptArgumentDescriptor[];
	_meta?: Record<string, unknown>;
}

export interface PromptMessage {
	role: Role;
	content: ContentBlock;
}

export interface PromptResult {
	description?: string;
	messages: PromptMessage[];
	_meta?: Record<string, unknown>;
}

/** A string becomes a single user message; a content block is wrapped likewise. */
export type PromptOutput =
	| string
	| ContentBlock
	| PromptMessage
	| PromptMessage[]
	| PromptResult;

export type PromptHandler<A = Record<string, string>> = (
	args: A,
	ctx: RequestContext,
) => PromptOutput | Promise<PromptOutput>;

export interface PromptDefinitionBase {
	name: string;
	title?: string;
	description?: string;
	_meta?: Record<string, unknown>;
	/** Argument completions keyed by argument name. */
	complete?: CompletionMap;
}

export interface TypedPromptDefinition<S extends Schema<Record<string, unknown>>>
	extends PromptDefinitionBase {
	/** Argument descriptors are derived from the schema's JSON Schema form. */
	argumentSchema: S;
	handler: PromptHandler<S["_output"]>;
}

export interface RawPromptDefinition extends PromptDefinitionBase {
	arguments?: PromptArgumentDescriptor[];
	handler: PromptHandler;
}

export type PromptDefinition =
	| TypedPromptDefinition<Schema<Record<string, unknown>>>
	| RawPromptDefinition;

export interface RegisteredPrompt extends PromptDescriptor {
	readonly parseArgs?: (args: Record<string, unknown>) => Record<string, unknown>;
	readonly handler: PromptHandler;
	readonly complete?: CompletionMap;
}

// ─── Completions ──────────────────────────────────────────────────────────────

export interface CompletionResult {
	values: string[];
	total?: number;
	hasMore?: boolean;
}

export interface CompletionContext extends RequestContext {
	/** The argument being completed. */
	readonly argument: { name: string; value: string };
	/** Values the client has already resolved for sibling arguments. */
	readonly resolved: Record<string, string>;
}

export type CompletionHandler = (
	value: string,
	ctx: CompletionContext,
) => string[] | CompletionResult | Promise<string[] | CompletionResult>;

/** Completion handlers keyed by argument (or template variable) name. */
export type CompletionMap = Record<string, CompletionHandler>;

// ─── Client-directed requests ─────────────────────────────────────────────────

export interface Root {
	uri: string;
	name?: string;
}

export interface ModelHint {
	name?: string;
}

export interface ModelPreferences {
	hints?: ModelHint[];
	costPriority?: number;
	speedPriority?: number;
	intelligencePriority?: number;
}

export interface SamplingMessage {
	role: Role;
	content: TextContent | ImageContent | AudioContent;
}

export interface CreateMessageParams {
	messages: SamplingMessage[];
	maxTokens: number;
	systemPrompt?: string;
	includeContext?: "none" | "thisServer" | "allServers";
	temperature?: number;
	stopSequences?: string[];
	modelPreferences?: ModelPreferences;
	metadata?: Record<string, unknown>;
}

export interface CreateMessageResult {
	role: Role;
	content: TextContent | ImageContent | AudioContent;
	model: string;
	stopReason?: string;
}

export interface ElicitParams {
	message: string;
	/** A flat object schema of primitive properties. */
	requestedSchema: JSONSchema;
}

export interface ElicitResult {
	action: "accept" | "decline" | "cancel";
	content?: Record<string, unknown>;
}

// ─── Server options ───────────────────────────────────────────────────────────

export interface McpServerOptions {
	/** Reported to the client from `initialize`. */
	serverInfo?: ServerInfo;
	/** Free-form usage guidance returned alongside `initialize`. */
	instructions?: string;
	/**
	 * Merged over the capabilities derived from what is registered. Use it to
	 * declare `experimental` entries or to force a capability on.
	 */
	capabilities?: ServerCapabilities;
	/** Protocol versions this server will accept, newest first. */
	protocolVersions?: string[];
	/** Advertise and honour `resources/subscribe`. Defaults to `true`. */
	subscriptions?: boolean;
	/** Advertise `logging` and honour `logging/setLevel`. Defaults to `true`. */
	logging?: boolean;
	/** Minimum level emitted before the client calls `logging/setLevel`. */
	logLevel?: LoggingLevel;
	/** Emit `.../list_changed` notifications on registry mutation. Defaults to `true`. */
	listChanged?: boolean;
	/** Max entries per list page. Omit to return every entry in one page. */
	pageSize?: number;
	/** Timeout in ms for requests this server sends to the client. Defaults to 30_000. */
	requestTimeout?: number;
	/** Called for internal faults that cannot be surfaced to the client. */
	onError?: (error: unknown) => void;
}
