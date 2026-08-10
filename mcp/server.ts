/**
 * @module
 * {@linkcode McpServer} — protocol dispatch, registries, and the client-facing
 * notification and request surface.
 */

import { Registry } from "./registry.ts";
import {
	ErrorCode,
	failure,
	isNotification,
	isRequest,
	isResponse,
	RpcError,
	success,
	toErrorBody,
} from "./jsonrpc.ts";
import { defineTool, normalizeToolResult, toolErrorResult } from "./tools.ts";
import { defineResource, defineResourceTemplate, normalizeResourceContents } from "./resources.ts";
import { definePrompt, normalizePromptResult } from "./prompts.ts";
import type { Schema } from "@bearmetal/forge";
import type {
	ClientSnapshot,
	CompletionContext,
	CompletionMap,
	CompletionResult,
	CreateMessageParams,
	CreateMessageResult,
	ElicitParams,
	ElicitResult,
	JsonRpcId,
	JsonRpcMessage,
	JsonRpcRequest,
	JsonRpcResponse,
	LoggingLevel,
	McpServerOptions,
	PromptDefinition,
	PromptDescriptor,
	RawPromptDefinition,
	RawToolDefinition,
	RegisteredPrompt,
	RegisteredResource,
	RegisteredResourceTemplate,
	RegisteredTool,
	RegistrationOptions,
	RequestContext,
	ResourceDefinition,
	ResourceDescriptor,
	ResourceRequestContext,
	ResourceTemplateDefinition,
	ResourceTemplateDescriptor,
	Root,
	ServerCapabilities,
	ServerInfo,
	ToolDefinition,
	ToolDescriptor,
	ToolResult,
	Transport,
	TypedPromptDefinition,
	TypedToolDefinition,
	VisibilityContext,
} from "./types.ts";

/** The protocol revision this server speaks by default. */
export const LATEST_PROTOCOL_VERSION = "2025-06-18";

/** Revisions this server will accept during `initialize`, newest first. */
export const SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = [
	LATEST_PROTOCOL_VERSION,
	"2025-03-26",
	"2024-11-05",
];

const LOG_LEVELS: readonly LoggingLevel[] = [
	"debug",
	"info",
	"notice",
	"warning",
	"error",
	"critical",
	"alert",
	"emergency",
];

type ListKind = "tools" | "resources" | "prompts";

interface PendingRequest {
	resolve: (value: Record<string, unknown>) => void;
	reject: (reason: unknown) => void;
	timer: ReturnType<typeof setTimeout>;
}

function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function requireString(params: Record<string, unknown>, key: string): string {
	const value = params[key];
	if (typeof value !== "string" || value.length === 0) {
		throw RpcError.invalidParams(`Missing or invalid "${key}"`);
	}
	return value;
}

function schemaIssues(error: unknown): unknown {
	const issues = (error as { issues?: unknown }).issues;
	return Array.isArray(issues) ? issues : undefined;
}

/**
 * A Model Context Protocol server.
 *
 * Registries are public — `server.tools`, `server.resources`,
 * `server.resourceTemplates`, `server.prompts` — so anything registered can be
 * enabled, disabled, replaced or removed at runtime, and the matching
 * `.../list_changed` notification is emitted for you.
 *
 * @example
 * ```ts
 * const server = new McpServer({ serverInfo: { name: "demo", version: "1.0.0" } });
 * server.addTool({
 * 	name: "add",
 * 	inputSchema: s.object({ a: s.number(), b: s.number() }),
 * 	handler: ({ a, b }) => String(a + b),
 * });
 * await server.connect(new StdioTransport());
 * ```
 */
export class McpServer {
	readonly tools: Registry<RegisteredTool> = new Registry("tool", (t) => t.name);
	readonly resources: Registry<RegisteredResource> = new Registry("resource", (r) => r.uri);
	readonly resourceTemplates: Registry<RegisteredResourceTemplate> = new Registry(
		"resource template",
		(t) => t.uriTemplate,
	);
	readonly prompts: Registry<RegisteredPrompt> = new Registry("prompt", (p) => p.name);

	#options: McpServerOptions;
	#serverInfo: ServerInfo;
	#instructions: string | undefined;
	#protocolVersions: readonly string[];
	#transport: Transport | null = null;
	#client: ClientSnapshot | null = null;
	#initialized = false;
	#logLevel: LoggingLevel;
	#subscriptions = new Set<string>();
	#inflight = new Map<JsonRpcId, AbortController>();
	#pending = new Map<number, PendingRequest>();
	#nextRequestId = 1;
	#advertised: ServerCapabilities = {};
	#dirtyLists = new Set<ListKind>();
	#flushQueued = false;
	#ready = Promise.withResolvers<ClientSnapshot>();

	/** Invoked when the client reports that its roots changed. */
	onRootsChanged?: () => void;

	constructor(options: McpServerOptions = {}) {
		this.#options = options;
		this.#serverInfo = options.serverInfo ?? { name: "bearmetal-mcp-server", version: "0.0.0" };
		this.#instructions = options.instructions;
		this.#protocolVersions = options.protocolVersions ?? SUPPORTED_PROTOCOL_VERSIONS;
		this.#logLevel = options.logLevel ?? "info";

		this.tools.onChange = () => this.#markDirty("tools");
		this.resources.onChange = () => this.#markDirty("resources");
		this.resourceTemplates.onChange = () => this.#markDirty("resources");
		this.prompts.onChange = () => this.#markDirty("prompts");

		this.#ready.promise.catch(() => {});
	}

	// ── Introspection ─────────────────────────────────────────────────────────

	/** What the client told us about itself, or `null` before `initialize`. */
	get client(): ClientSnapshot | null {
		return this.#client;
	}

	/** True once the client has sent `notifications/initialized`. */
	get initialized(): boolean {
		return this.#initialized;
	}

	get serverInfo(): ServerInfo {
		return this.#serverInfo;
	}

	/** Resolves with the client snapshot once the handshake completes. */
	get ready(): Promise<ClientSnapshot> {
		return this.#ready.promise;
	}

	/** The capabilities this server would advertise right now. */
	capabilities(): ServerCapabilities {
		const caps: ServerCapabilities = {};
		const listChanged = this.#options.listChanged ?? true;

		if (!this.tools.isEmpty) caps.tools = { listChanged };
		if (!this.resources.isEmpty || !this.resourceTemplates.isEmpty) {
			caps.resources = { listChanged, subscribe: this.#options.subscriptions ?? true };
		}
		if (!this.prompts.isEmpty) caps.prompts = { listChanged };
		if (this.#options.logging ?? true) caps.logging = {};
		if (this.#hasCompletions()) caps.completions = {};

		const overrides = this.#options.capabilities;
		if (!overrides) return caps;

		const merged: ServerCapabilities = { ...caps, ...overrides };
		for (const key of ["prompts", "resources", "tools"] as const) {
			const base = caps[key];
			const override = overrides[key];
			if (base && override) merged[key] = { ...base, ...override };
		}
		return merged;
	}

	#hasCompletions(): boolean {
		for (const prompt of this.prompts) if (prompt.complete) return true;
		for (const template of this.resourceTemplates) if (template.complete) return true;
		return false;
	}

	// ── Registration ──────────────────────────────────────────────────────────

	/**
	 * Register one tool. Accepts a raw definition or the output of
	 * {@linkcode defineTool} — the latter passes through untouched.
	 */
	addTool<S extends Schema<Record<string, unknown>>>(
		tool: TypedToolDefinition<S>,
		options?: RegistrationOptions,
	): this;
	addTool(tool: RawToolDefinition | RegisteredTool, options?: RegistrationOptions): this;
	addTool(tool: ToolDefinition | RegisteredTool, options?: RegistrationOptions): this {
		this.tools.add(defineTool(tool as RawToolDefinition), options);
		return this;
	}

	/** Register several tools at once, all with default registration options. */
	addTools(...tools: (ToolDefinition | RegisteredTool)[]): this {
		for (const tool of tools) this.addTool(tool as RawToolDefinition);
		return this;
	}

	addResource(
		resource: ResourceDefinition | RegisteredResource,
		options?: RegistrationOptions,
	): this {
		this.resources.add(defineResource(resource as ResourceDefinition), options);
		return this;
	}

	addResources(...resources: (ResourceDefinition | RegisteredResource)[]): this {
		for (const resource of resources) this.addResource(resource);
		return this;
	}

	addResourceTemplate(
		template: ResourceTemplateDefinition | RegisteredResourceTemplate,
		options?: RegistrationOptions,
	): this {
		this.resourceTemplates.add(
			defineResourceTemplate(template as ResourceTemplateDefinition),
			options,
		);
		return this;
	}

	addResourceTemplates(
		...templates: (ResourceTemplateDefinition | RegisteredResourceTemplate)[]
	): this {
		for (const template of templates) this.addResourceTemplate(template);
		return this;
	}

	/**
	 * Register one prompt. Accepts a raw definition or the output of
	 * {@linkcode definePrompt} — the latter passes through untouched.
	 */
	addPrompt<S extends Schema<Record<string, unknown>>>(
		prompt: TypedPromptDefinition<S>,
		options?: RegistrationOptions,
	): this;
	addPrompt(prompt: RawPromptDefinition | RegisteredPrompt, options?: RegistrationOptions): this;
	addPrompt(prompt: PromptDefinition | RegisteredPrompt, options?: RegistrationOptions): this {
		this.prompts.add(definePrompt(prompt as RawPromptDefinition), options);
		return this;
	}

	addPrompts(...prompts: (PromptDefinition | RegisteredPrompt)[]): this {
		for (const prompt of prompts) this.addPrompt(prompt as RawPromptDefinition);
		return this;
	}

	setServerInfo(info: ServerInfo): this {
		this.#serverInfo = info;
		return this;
	}

	setInstructions(instructions: string): this {
		this.#instructions = instructions;
		return this;
	}

	/** Merge extra capabilities over the derived set (e.g. `experimental`). */
	setCapabilities(capabilities: ServerCapabilities): this {
		this.#options = { ...this.#options, capabilities };
		return this;
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	/**
	 * Attach a transport and serve until it closes. Resolves on clean shutdown
	 * — for stdio that means the client closed our stdin.
	 */
	async connect(transport: Transport): Promise<void> {
		if (this.#transport) throw new Error("Server is already connected to a transport");
		this.#transport = transport;
		transport.onInvalid = (_raw, error) => {
			this.#send(failure(null, {
				code: ErrorCode.ParseError,
				message: error instanceof Error ? error.message : "Parse error",
			}));
		};
		await transport.start((message) => this.#onMessage(message));
		await transport.closed;
		this.#teardown();
	}

	/** Close the transport, ending {@linkcode McpServer.connect}. */
	async close(): Promise<void> {
		await this.#transport?.close();
		this.#teardown();
	}

	#teardown(): void {
		for (const controller of this.#inflight.values()) controller.abort();
		this.#inflight.clear();
		for (const pending of this.#pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(new Error("Transport closed"));
		}
		this.#pending.clear();
		if (!this.#initialized) this.#ready.reject(new Error("Transport closed before initialize"));
		this.#transport = null;
		this.#client = null;
		this.#initialized = false;
	}

	// ── Outbound ──────────────────────────────────────────────────────────────

	#send(message: JsonRpcMessage): void {
		if (!this.#transport) return;
		try {
			const sent = this.#transport.send(message);
			if (sent instanceof Promise) sent.catch((error) => this.#reportError(error));
		} catch (error) {
			this.#reportError(error);
		}
	}

	#notify(method: string, params?: Record<string, unknown>): void {
		this.#send(params ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", method });
	}

	#reportError(error: unknown): void {
		if (this.#options.onError) this.#options.onError(error);
		else console.error("[mcp]", error);
	}

	/**
	 * Send a request to the client and await its response. Prefer the typed
	 * wrappers ({@linkcode McpServer.listRoots}, {@linkcode McpServer.createMessage},
	 * {@linkcode McpServer.elicit}).
	 */
	request(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
		if (!this.#transport) return Promise.reject(new Error("Server is not connected"));

		const id = this.#nextRequestId++;
		const timeout = this.#options.requestTimeout ?? 30_000;

		return new Promise<Record<string, unknown>>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.#pending.delete(id);
				this.#notify("notifications/cancelled", { requestId: id, reason: "timeout" });
				reject(new RpcError(ErrorCode.RequestTimeout, `Request timed out: ${method}`));
			}, timeout);
			this.#pending.set(id, { resolve, reject, timer });
			this.#send(params ? { jsonrpc: "2.0", id, method, params } : { jsonrpc: "2.0", id, method });
		});
	}

	/** Round-trip a `ping` to the client. */
	async ping(): Promise<void> {
		await this.request("ping");
	}

	/** Ask the client for its filesystem roots. Requires the `roots` capability. */
	async listRoots(): Promise<Root[]> {
		this.#requireClientCapability("roots");
		const result = await this.request("roots/list");
		return (result.roots ?? []) as Root[];
	}

	/** Ask the client to sample its model. Requires the `sampling` capability. */
	async createMessage(params: CreateMessageParams): Promise<CreateMessageResult> {
		this.#requireClientCapability("sampling");
		const result = await this.request(
			"sampling/createMessage",
			params as unknown as Record<string, unknown>,
		);
		return result as unknown as CreateMessageResult;
	}

	/** Ask the client to collect input from the user. Requires `elicitation`. */
	async elicit(params: ElicitParams): Promise<ElicitResult> {
		this.#requireClientCapability("elicitation");
		const result = await this.request(
			"elicitation/create",
			params as unknown as Record<string, unknown>,
		);
		return result as unknown as ElicitResult;
	}

	#requireClientCapability(name: "roots" | "sampling" | "elicitation"): void {
		if (!this.#client) throw new Error("Client has not completed initialization");
		if (!this.#client.capabilities[name]) {
			throw new Error(`Client does not support the "${name}" capability`);
		}
	}

	/**
	 * Emit `notifications/message`. Dropped when below the client's level, or
	 * when logging is disabled.
	 */
	log(level: LoggingLevel, data: unknown, logger?: string): void {
		if (!(this.#options.logging ?? true)) return;
		if (LOG_LEVELS.indexOf(level) < LOG_LEVELS.indexOf(this.#logLevel)) return;
		this.#notify("notifications/message", logger ? { level, logger, data } : { level, data });
	}

	/** Tell subscribers that a resource changed. */
	notifyResourceUpdated(uri: string): void {
		if (!this.#subscriptions.has(uri)) return;
		this.#notify("notifications/resources/updated", { uri });
	}

	/** Currently subscribed resource uris. */
	get subscriptions(): ReadonlySet<string> {
		return this.#subscriptions;
	}

	#markDirty(kind: ListKind): void {
		this.#dirtyLists.add(kind);
		if (this.#flushQueued) return;
		this.#flushQueued = true;
		queueMicrotask(() => {
			this.#flushQueued = false;
			const kinds = [...this.#dirtyLists];
			this.#dirtyLists.clear();
			if (!this.#initialized) return;
			for (const dirty of kinds) {
				if (this.#advertised[dirty]?.listChanged !== true) continue;
				this.#notify(`notifications/${dirty}/list_changed`);
			}
		});
	}

	// ── Inbound ───────────────────────────────────────────────────────────────

	async #onMessage(message: JsonRpcMessage): Promise<void> {
		try {
			if (isResponse(message)) return this.#onResponse(message);
			if (isNotification(message)) return this.#onNotification(message.method, message.params);
			if (isRequest(message)) await this.#onRequest(message);
		} catch (error) {
			this.#reportError(error);
		}
	}

	#onResponse(message: JsonRpcResponse): void {
		if (typeof message.id !== "number") return;
		const pending = this.#pending.get(message.id);
		if (!pending) return;
		this.#pending.delete(message.id);
		clearTimeout(pending.timer);

		if ("error" in message) {
			pending.reject(new RpcError(message.error.code, message.error.message, message.error.data));
		} else {
			pending.resolve(asRecord(message.result));
		}
	}

	#onNotification(method: string, params?: Record<string, unknown>): void {
		switch (method) {
			case "notifications/initialized": {
				this.#initialized = true;
				if (this.#client) this.#ready.resolve(this.#client);
				break;
			}
			case "notifications/cancelled": {
				const requestId = params?.requestId as JsonRpcId | undefined;
				if (requestId === undefined) break;
				this.#inflight.get(requestId)?.abort(
					new RpcError(ErrorCode.RequestCancelled, String(params?.reason ?? "cancelled")),
				);
				this.#inflight.delete(requestId);
				break;
			}
			case "notifications/roots/list_changed": {
				this.onRootsChanged?.();
				break;
			}
			default:
				break;
		}
	}

	async #onRequest(request: JsonRpcRequest): Promise<void> {
		const controller = new AbortController();
		this.#inflight.set(request.id, controller);
		try {
			const result = await this.#dispatch(request, controller.signal);
			if (!controller.signal.aborted) this.#send(success(request.id, result));
		} catch (error) {
			if (!controller.signal.aborted) this.#send(failure(request.id, toErrorBody(error)));
		} finally {
			this.#inflight.delete(request.id);
		}
	}

	async #dispatch(
		request: JsonRpcRequest,
		signal: AbortSignal,
	): Promise<Record<string, unknown>> {
		const params = request.params ?? {};
		const method = request.method;

		if (method === "initialize") return this.#handleInitialize(params);
		if (method === "ping") return {};

		if (!this.#client) {
			throw new RpcError(
				ErrorCode.NotInitialized,
				`Received "${method}" before initialization completed`,
			);
		}

		const ctx = this.#createContext(request, signal);

		switch (method) {
			case "tools/list":
				return this.#page("tools", this.tools.available(ctx).map(toolDescriptor), params);
			case "tools/call":
				return await this.#handleToolCall(params, ctx) as unknown as Record<string, unknown>;
			case "resources/list":
				return this.#page("resources", await this.#listResources(ctx), params);
			case "resources/templates/list":
				return this.#page(
					"resourceTemplates",
					this.resourceTemplates.available(ctx).map(templateDescriptor),
					params,
				);
			case "resources/read":
				return await this.#handleResourceRead(params, ctx);
			case "resources/subscribe":
				return this.#handleSubscribe(params, true);
			case "resources/unsubscribe":
				return this.#handleSubscribe(params, false);
			case "prompts/list":
				return this.#page("prompts", this.prompts.available(ctx).map(promptDescriptor), params);
			case "prompts/get":
				return await this.#handlePromptGet(params, ctx) as unknown as Record<string, unknown>;
			case "completion/complete":
				return await this.#handleComplete(params, ctx);
			case "logging/setLevel":
				return this.#handleSetLevel(params);
			default:
				throw RpcError.methodNotFound(method);
		}
	}

	// ── Handlers ──────────────────────────────────────────────────────────────

	#handleInitialize(params: Record<string, unknown>): Record<string, unknown> {
		const requested = typeof params.protocolVersion === "string"
			? params.protocolVersion
			: this.#protocolVersions[0];
		const version = this.#protocolVersions.includes(requested)
			? requested
			: this.#protocolVersions[0];

		const info = asRecord(params.clientInfo);
		this.#client = {
			info: {
				name: typeof info.name === "string" ? info.name : "unknown-client",
				version: typeof info.version === "string" ? info.version : "unknown",
				...(typeof info.title === "string" ? { title: info.title } : {}),
			},
			capabilities: asRecord(params.capabilities),
			protocolVersion: version,
		};

		this.#advertised = this.capabilities();

		const result: Record<string, unknown> = {
			protocolVersion: version,
			capabilities: this.#advertised,
			serverInfo: this.#serverInfo,
		};
		if (this.#instructions !== undefined) result.instructions = this.#instructions;
		return result;
	}

	async #handleToolCall(
		params: Record<string, unknown>,
		ctx: RequestContext,
	): Promise<ToolResult> {
		const name = requireString(params, "name");
		const tool = this.tools.resolve(name, ctx);
		if (!tool) throw RpcError.invalidParams(`Unknown tool: ${name}`, { name });

		let args = asRecord(params.arguments);
		if (tool.parseInput) {
			try {
				args = tool.parseInput(args);
			} catch (error) {
				throw RpcError.invalidParams(
					`Invalid arguments for tool "${name}"`,
					schemaIssues(error) ?? String(error),
				);
			}
		}

		let result: ToolResult;
		try {
			result = normalizeToolResult(await tool.handler(args, ctx));
		} catch (error) {
			if (error instanceof RpcError) throw error;
			return toolErrorResult(error);
		}

		if (tool.parseOutput && result.structuredContent !== undefined) {
			try {
				tool.parseOutput(result.structuredContent);
			} catch (error) {
				throw RpcError.internal(
					`Tool "${name}" returned output that violates its outputSchema`,
					schemaIssues(error) ?? String(error),
				);
			}
		}
		return result;
	}

	async #listResources(ctx: VisibilityContext): Promise<ResourceDescriptor[]> {
		const listed = this.resources.available(ctx).map(resourceDescriptor);
		for (const template of this.resourceTemplates.available(ctx)) {
			if (!template.list) continue;
			listed.push(...await template.list(ctx));
		}
		return listed;
	}

	async #handleResourceRead(
		params: Record<string, unknown>,
		ctx: RequestContext,
	): Promise<Record<string, unknown>> {
		const uri = requireString(params, "uri");
		const resource = this.resources.resolve(uri, ctx);
		if (resource) {
			const output = await resource.read(withResourceTarget(ctx, uri, {}));
			return { contents: normalizeResourceContents(uri, output, resource.mimeType) };
		}

		for (const template of this.resourceTemplates.available(ctx)) {
			const captured = template.match(uri);
			if (!captured) continue;
			const output = await template.read(withResourceTarget(ctx, uri, captured));
			return { contents: normalizeResourceContents(uri, output, template.mimeType) };
		}

		throw RpcError.resourceNotFound(uri);
	}

	#handleSubscribe(params: Record<string, unknown>, subscribe: boolean): Record<string, unknown> {
		if (!(this.#options.subscriptions ?? true)) {
			throw RpcError.methodNotFound("resources/subscribe");
		}
		const uri = requireString(params, "uri");
		if (subscribe) this.#subscriptions.add(uri);
		else this.#subscriptions.delete(uri);
		return {};
	}

	async #handlePromptGet(
		params: Record<string, unknown>,
		ctx: RequestContext,
	): Promise<Record<string, unknown>> {
		const name = requireString(params, "name");
		const prompt = this.prompts.resolve(name, ctx);
		if (!prompt) throw RpcError.invalidParams(`Unknown prompt: ${name}`, { name });

		let args = asRecord(params.arguments);
		if (prompt.parseArgs) {
			try {
				args = prompt.parseArgs(args);
			} catch (error) {
				throw RpcError.invalidParams(
					`Invalid arguments for prompt "${name}"`,
					schemaIssues(error) ?? String(error),
				);
			}
		}

		const result = normalizePromptResult(
			await prompt.handler(args as Record<string, string>, ctx),
		);
		return result as unknown as Record<string, unknown>;
	}

	async #handleComplete(
		params: Record<string, unknown>,
		ctx: RequestContext,
	): Promise<Record<string, unknown>> {
		const ref = asRecord(params.ref);
		const argument = asRecord(params.argument);
		const argName = typeof argument.name === "string" ? argument.name : "";
		const argValue = typeof argument.value === "string" ? argument.value : "";

		let handlers: CompletionMap | undefined;
		if (ref.type === "ref/prompt" && typeof ref.name === "string") {
			handlers = this.prompts.resolve(ref.name, ctx)?.complete;
		} else if (ref.type === "ref/resource" && typeof ref.uri === "string") {
			handlers = this.resourceTemplates.resolve(ref.uri, ctx)?.complete;
		}

		const handler = handlers?.[argName];
		if (!handler) return { completion: { values: [] } };

		const completionCtx: CompletionContext = {
			...ctx,
			argument: { name: argName, value: argValue },
			resolved: asRecord(asRecord(params.context).arguments) as Record<string, string>,
		};

		const raw = await handler(argValue, completionCtx);
		const completion: CompletionResult = Array.isArray(raw) ? { values: raw } : raw;
		const values = completion.values.slice(0, 100);
		return {
			completion: {
				values,
				total: completion.total ?? completion.values.length,
				hasMore: completion.hasMore ?? completion.values.length > values.length,
			},
		};
	}

	#handleSetLevel(params: Record<string, unknown>): Record<string, unknown> {
		const level = params.level;
		if (typeof level !== "string" || !LOG_LEVELS.includes(level as LoggingLevel)) {
			throw RpcError.invalidParams(`Unknown logging level: ${String(level)}`);
		}
		this.#logLevel = level as LoggingLevel;
		return {};
	}

	// ── Support ───────────────────────────────────────────────────────────────

	#createContext(request: JsonRpcRequest, signal: AbortSignal): RequestContext {
		const meta = request.params?._meta as Record<string, unknown> | undefined;
		const progressToken = meta?.progressToken as string | number | undefined;

		return {
			server: this,
			method: request.method,
			requestId: request.id,
			signal,
			client: this.#client,
			meta,
			progress: (progress, total, message) => {
				if (progressToken === undefined) return;
				const params: Record<string, unknown> = { progressToken, progress };
				if (total !== undefined) params.total = total;
				if (message !== undefined) params.message = message;
				this.#notify("notifications/progress", params);
			},
			log: (level, data, logger) => this.log(level, data, logger),
		};
	}

	#page<T>(
		key: string,
		items: T[],
		params: Record<string, unknown>,
	): Record<string, unknown> {
		const pageSize = this.#options.pageSize;
		let offset = 0;

		if (typeof params.cursor === "string") {
			try {
				offset = Number.parseInt(atob(params.cursor), 10);
			} catch {
				offset = Number.NaN;
			}
			if (!Number.isInteger(offset) || offset < 0 || offset > items.length) {
				throw RpcError.invalidParams(`Invalid cursor: ${params.cursor}`);
			}
		}

		if (pageSize === undefined || pageSize <= 0) {
			return { [key]: items.slice(offset) };
		}

		const end = Math.min(offset + pageSize, items.length);
		const result: Record<string, unknown> = { [key]: items.slice(offset, end) };
		if (end < items.length) result.nextCursor = btoa(String(end));
		return result;
	}
}

function withResourceTarget(
	ctx: RequestContext,
	uri: string,
	params: Record<string, string>,
): ResourceRequestContext {
	return { ...ctx, uri, params };
}

function toolDescriptor(tool: RegisteredTool): ToolDescriptor {
	const { name, title, description, inputSchema, outputSchema, annotations, _meta } = tool;
	const descriptor: ToolDescriptor = { name, inputSchema };
	if (title !== undefined) descriptor.title = title;
	if (description !== undefined) descriptor.description = description;
	if (outputSchema !== undefined) descriptor.outputSchema = outputSchema;
	if (annotations !== undefined) descriptor.annotations = annotations;
	if (_meta !== undefined) descriptor._meta = _meta;
	return descriptor;
}

function resourceDescriptor(resource: RegisteredResource): ResourceDescriptor {
	const { read: _read, ...descriptor } = resource;
	return descriptor;
}

function templateDescriptor(template: RegisteredResourceTemplate): ResourceTemplateDescriptor {
	const { read: _read, list: _list, complete: _complete, match: _match, ...descriptor } = template;
	return descriptor;
}

function promptDescriptor(prompt: RegisteredPrompt): PromptDescriptor {
	const { handler: _handler, parseArgs: _parseArgs, complete: _complete, ...descriptor } = prompt;
	return descriptor;
}
