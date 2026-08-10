import { assert, assertEquals, assertRejects } from "@std/assert";
import { s } from "@bearmetal/forge";
import { McpServer } from "./server.ts";
import { MemoryTransport } from "./transport.ts";
import { ErrorCode } from "./jsonrpc.ts";
import { text } from "./content.ts";
import type { JsonRpcMessage, JsonRpcNotification, McpServerOptions, ToolResult } from "./types.ts";

// ─── Harness ──────────────────────────────────────────────────────────────────

class RpcFailure extends Error {
	constructor(readonly code: number, message: string, readonly data?: unknown) {
		super(message);
	}
}

/** A minimal MCP client that drives a server over an in-process transport. */
class TestClient {
	#transport: MemoryTransport;
	#nextId = 1;
	#pending = new Map<number, {
		resolve: (value: Record<string, unknown>) => void;
		reject: (reason: unknown) => void;
	}>();

	readonly notifications: JsonRpcNotification[] = [];
	/** Responds to server-initiated requests, keyed by method. */
	readonly responders = new Map<string, (params?: Record<string, unknown>) => unknown>();

	constructor(transport: MemoryTransport) {
		this.#transport = transport;
		transport.start((message) => this.#onMessage(message));
	}

	#onMessage(message: JsonRpcMessage): void {
		if ("method" in message && !("id" in message)) {
			this.notifications.push(message);
			return;
		}
		if ("method" in message) {
			const responder = this.responders.get(message.method);
			const result = responder ? responder(message.params) : {};
			this.#transport.send({
				jsonrpc: "2.0",
				id: message.id,
				result: result as Record<string, unknown>,
			});
			return;
		}
		const pending = this.#pending.get(message.id as number);
		if (!pending) return;
		this.#pending.delete(message.id as number);
		if ("error" in message) {
			pending.reject(new RpcFailure(message.error.code, message.error.message, message.error.data));
		} else {
			pending.resolve(message.result);
		}
	}

	request(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
		const id = this.#nextId++;
		return new Promise((resolve, reject) => {
			this.#pending.set(id, { resolve, reject });
			this.#transport.send({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
		});
	}

	notify(method: string, params?: Record<string, unknown>): void {
		this.#transport.send({ jsonrpc: "2.0", method, ...(params ? { params } : {}) });
	}

	notificationsOf(method: string): JsonRpcNotification[] {
		return this.notifications.filter((n) => n.method === method);
	}
}

interface Harness extends AsyncDisposable {
	server: McpServer;
	client: TestClient;
}

/** Start a server on an in-process transport and complete the handshake. */
async function connect(
	build: (server: McpServer) => void,
	options: McpServerOptions = {},
	clientCapabilities: Record<string, unknown> = {},
): Promise<Harness> {
	const server = new McpServer({
		serverInfo: { name: "test-server", version: "1.2.3" },
		...options,
	});
	build(server);

	const [serverSide, clientSide] = MemoryTransport.pair();
	const running = server.connect(serverSide);
	const client = new TestClient(clientSide);

	await client.request("initialize", {
		protocolVersion: "2025-06-18",
		capabilities: clientCapabilities,
		clientInfo: { name: "test-client", version: "0.1.0" },
	});
	client.notify("notifications/initialized");

	return {
		server,
		client,
		async [Symbol.asyncDispose]() {
			await server.close();
			await running;
		},
	};
}

const echo = {
	name: "echo",
	description: "Echo a message back",
	inputSchema: s.object({ message: s.string() }),
	handler: ({ message }: { message: string }) => message,
};

// ─── Lifecycle ────────────────────────────────────────────────────────────────

Deno.test("initialize reports server info, capabilities and the negotiated version", async () => {
	await using harness = await connect((server) => server.addTool(echo));

	const result = await harness.client.request("initialize", {
		protocolVersion: "2025-06-18",
		capabilities: {},
		clientInfo: { name: "test-client", version: "0.1.0" },
	});

	assertEquals(result.protocolVersion, "2025-06-18");
	assertEquals(result.serverInfo, { name: "test-server", version: "1.2.3" });
	assertEquals(result.capabilities, {
		tools: { listChanged: true },
		logging: {},
	});
});

Deno.test("initialize falls back to the newest supported version", async () => {
	await using harness = await connect(() => {});

	const result = await harness.client.request("initialize", {
		protocolVersion: "1999-01-01",
		capabilities: {},
		clientInfo: { name: "old-client", version: "0.0.1" },
	});

	assertEquals(result.protocolVersion, "2025-06-18");
});

Deno.test("initialize carries instructions when configured", async () => {
	await using harness = await connect(() => {}, { instructions: "Be excellent." });

	const result = await harness.client.request("initialize", {
		protocolVersion: "2025-06-18",
		capabilities: {},
		clientInfo: { name: "c", version: "1" },
	});

	assertEquals(result.instructions, "Be excellent.");
});

Deno.test("requests before initialize are refused", async () => {
	const server = new McpServer();
	server.addTool(echo);
	const [serverSide, clientSide] = MemoryTransport.pair();
	const running = server.connect(serverSide);
	const client = new TestClient(clientSide);

	const error = await assertRejects(
		() => client.request("tools/list"),
		RpcFailure,
	);
	assertEquals(error.code, ErrorCode.NotInitialized);

	await server.close();
	await running;
});

Deno.test("ping is answered before and after initialization", async () => {
	await using harness = await connect(() => {});
	assertEquals(await harness.client.request("ping"), {});
});

Deno.test("unknown methods produce a method-not-found error", async () => {
	await using harness = await connect(() => {});
	const error = await assertRejects(
		() => harness.client.request("does/not/exist"),
		RpcFailure,
	);
	assertEquals(error.code, ErrorCode.MethodNotFound);
});

// ─── Tools ────────────────────────────────────────────────────────────────────

Deno.test("tools/list projects forge schemas into JSON Schema", async () => {
	await using harness = await connect((server) => server.addTool(echo));

	const result = await harness.client.request("tools/list");
	assertEquals(result.tools, [{
		name: "echo",
		description: "Echo a message back",
		inputSchema: {
			type: "object",
			properties: { message: { type: "string" } },
			required: ["message"],
		},
	}]);
});

Deno.test("tools/call validates arguments and returns text content", async () => {
	await using harness = await connect((server) => server.addTool(echo));

	const ok = await harness.client.request("tools/call", {
		name: "echo",
		arguments: { message: "hi" },
	});
	assertEquals(ok.content, [text("hi")]);

	const error = await assertRejects(
		() =>
			harness.client.request("tools/call", {
				name: "echo",
				arguments: { message: 42 },
			}),
		RpcFailure,
	);
	assertEquals(error.code, ErrorCode.InvalidParams);
	assert(Array.isArray(error.data), "schema issues are attached to the error");
});

Deno.test("tools/call on an unknown tool is an invalid-params error", async () => {
	await using harness = await connect((server) => server.addTool(echo));

	const error = await assertRejects(
		() => harness.client.request("tools/call", { name: "nope" }),
		RpcFailure,
	);
	assertEquals(error.code, ErrorCode.InvalidParams);
});

Deno.test("a throwing tool reports isError instead of failing the request", async () => {
	await using harness = await connect((server) =>
		server.addTool({
			name: "boom",
			handler: () => {
				throw new Error("kaboom");
			},
		})
	);

	const result = await harness.client.request("tools/call", {
		name: "boom",
	}) as unknown as ToolResult;
	assertEquals(result.isError, true);
	assertEquals(result.content, [text("kaboom")]);
});

Deno.test("a plain object return becomes structuredContent mirrored into text", async () => {
	await using harness = await connect((server) =>
		server.addTool({
			name: "stats",
			outputSchema: s.object({ count: s.number() }),
			handler: () => ({ count: 7 }),
		})
	);

	const result = await harness.client.request("tools/call", {
		name: "stats",
	}) as unknown as ToolResult;
	assertEquals(result.structuredContent, { count: 7 });
	assertEquals(result.content, [text('{\n  "count": 7\n}')]);
});

Deno.test("output that violates outputSchema is an internal error", async () => {
	await using harness = await connect((server) =>
		server.addTool({
			name: "liar",
			outputSchema: s.object({ count: s.number() }),
			handler: () => ({ count: "not a number" }),
		})
	);

	const error = await assertRejects(
		() => harness.client.request("tools/call", { name: "liar" }),
		RpcFailure,
	);
	assertEquals(error.code, ErrorCode.InternalError);
});

Deno.test("disabled tools are hidden and refuse invocation", async () => {
	await using harness = await connect((server) => {
		server.addTool(echo);
		server.addTool({ name: "secret", handler: () => "shh" }, { enabled: false });
	});

	const listed = await harness.client.request("tools/list");
	assertEquals((listed.tools as { name: string }[]).map((t) => t.name), ["echo"]);

	await assertRejects(
		() => harness.client.request("tools/call", { name: "secret" }),
		RpcFailure,
	);

	harness.server.tools.enable("secret");
	const relisted = await harness.client.request("tools/list");
	assertEquals((relisted.tools as { name: string }[]).map((t) => t.name), ["echo", "secret"]);
});

Deno.test("visibility predicates hide entries per client", async () => {
	await using harness = await connect((server) => {
		server.addTool(echo);
		server.addTool(
			{ name: "power-user-only", handler: () => "ok" },
			{ visible: (ctx) => ctx.client?.info.name === "privileged-client" },
		);
	});

	const listed = await harness.client.request("tools/list");
	assertEquals((listed.tools as { name: string }[]).map((t) => t.name), ["echo"]);
});

Deno.test("registry mutation after initialization emits list_changed", async () => {
	await using harness = await connect((server) => server.addTool(echo));

	harness.server.addTool({ name: "late", handler: () => "ok" });
	await new Promise((resolve) => setTimeout(resolve, 0));

	assertEquals(harness.client.notificationsOf("notifications/tools/list_changed").length, 1);
});

// ─── Resources ────────────────────────────────────────────────────────────────

Deno.test("resources list and read, including templates", async () => {
	await using harness = await connect((server) => {
		server.addResource({
			uri: "config://app",
			name: "config",
			mimeType: "application/json",
			read: () => '{"theme":"dark"}',
		});
		server.addResourceTemplate({
			uriTemplate: "note://{id}",
			name: "note",
			mimeType: "text/plain",
			read: (ctx) => `note ${ctx.params.id}`,
		});
	});

	const listed = await harness.client.request("resources/list");
	assertEquals(listed.resources, [{
		uri: "config://app",
		name: "config",
		mimeType: "application/json",
	}]);

	const templates = await harness.client.request("resources/templates/list");
	assertEquals(templates.resourceTemplates, [{
		uriTemplate: "note://{id}",
		name: "note",
		mimeType: "text/plain",
	}]);

	const direct = await harness.client.request("resources/read", { uri: "config://app" });
	assertEquals(direct.contents, [{
		uri: "config://app",
		mimeType: "application/json",
		text: '{"theme":"dark"}',
	}]);

	const templated = await harness.client.request("resources/read", { uri: "note://42" });
	assertEquals(templated.contents, [{
		uri: "note://42",
		mimeType: "text/plain",
		text: "note 42",
	}]);
});

Deno.test("reading an unregistered uri is a resource-not-found error", async () => {
	await using harness = await connect((server) =>
		server.addResource({ uri: "a://b", read: () => "x" })
	);

	const error = await assertRejects(
		() => harness.client.request("resources/read", { uri: "a://missing" }),
		RpcFailure,
	);
	assertEquals(error.code, ErrorCode.ResourceNotFound);
});

Deno.test("binary reads are base64-encoded as a blob", async () => {
	await using harness = await connect((server) =>
		server.addResource({
			uri: "bin://data",
			mimeType: "application/octet-stream",
			read: () => new Uint8Array([1, 2, 3]),
		})
	);

	const result = await harness.client.request("resources/read", { uri: "bin://data" });
	assertEquals(result.contents, [{
		uri: "bin://data",
		mimeType: "application/octet-stream",
		blob: "AQID",
	}]);
});

Deno.test("subscriptions gate resource update notifications", async () => {
	await using harness = await connect((server) =>
		server.addResource({ uri: "live://feed", read: () => "tick" })
	);

	harness.server.notifyResourceUpdated("live://feed");
	assertEquals(harness.client.notificationsOf("notifications/resources/updated").length, 0);

	await harness.client.request("resources/subscribe", { uri: "live://feed" });
	harness.server.notifyResourceUpdated("live://feed");
	assertEquals(harness.client.notificationsOf("notifications/resources/updated").length, 1);

	await harness.client.request("resources/unsubscribe", { uri: "live://feed" });
	harness.server.notifyResourceUpdated("live://feed");
	assertEquals(harness.client.notificationsOf("notifications/resources/updated").length, 1);
});

// ─── Prompts ──────────────────────────────────────────────────────────────────

Deno.test("prompts list their arguments and render messages", async () => {
	await using harness = await connect((server) =>
		server.addPrompt({
			name: "review",
			description: "Review a diff",
			arguments: [{ name: "diff", required: true }],
			handler: ({ diff }) => `Please review:\n${diff}`,
		})
	);

	const listed = await harness.client.request("prompts/list");
	assertEquals(listed.prompts, [{
		name: "review",
		description: "Review a diff",
		arguments: [{ name: "diff", required: true }],
	}]);

	const got = await harness.client.request("prompts/get", {
		name: "review",
		arguments: { diff: "-a\n+b" },
	});
	assertEquals(got.messages, [{ role: "user", content: text("Please review:\n-a\n+b") }]);
});

Deno.test("prompt arguments can be derived from a forge schema", async () => {
	await using harness = await connect((server) =>
		server.addPrompt({
			name: "greet",
			argumentSchema: s.object({
				name: s.string().describe("Who to greet"),
				title: s.string().optional(),
			}),
			handler: ({ name }) => `Hello ${name}`,
		})
	);

	const listed = await harness.client.request("prompts/list");
	assertEquals(listed.prompts, [{
		name: "greet",
		arguments: [
			{ name: "name", description: "Who to greet", required: true },
			{ name: "title" },
		],
	}]);
});

// ─── Completions ──────────────────────────────────────────────────────────────

Deno.test("completion/complete resolves registered argument handlers", async () => {
	await using harness = await connect((server) =>
		server.addPrompt({
			name: "greet",
			arguments: [{ name: "who" }],
			complete: {
				who: (value) => ["ada", "alan", "grace"].filter((n) => n.startsWith(value)),
			},
			handler: ({ who }) => `Hello ${who}`,
		})
	);

	const result = await harness.client.request("completion/complete", {
		ref: { type: "ref/prompt", name: "greet" },
		argument: { name: "who", value: "a" },
	});
	assertEquals(result.completion, { values: ["ada", "alan"], total: 2, hasMore: false });
});

Deno.test("completion for an unknown argument returns an empty list", async () => {
	await using harness = await connect((server) =>
		server.addPrompt({ name: "p", handler: () => "x" })
	);

	const result = await harness.client.request("completion/complete", {
		ref: { type: "ref/prompt", name: "p" },
		argument: { name: "nope", value: "" },
	});
	assertEquals(result.completion, { values: [] });
});

// ─── Pagination ───────────────────────────────────────────────────────────────

Deno.test("list results paginate when pageSize is configured", async () => {
	await using harness = await connect(
		(server) => {
			for (let i = 0; i < 5; i++) {
				server.addTool({ name: `tool-${i}`, handler: () => String(i) });
			}
		},
		{ pageSize: 2 },
	);

	const first = await harness.client.request("tools/list");
	assertEquals((first.tools as { name: string }[]).map((t) => t.name), ["tool-0", "tool-1"]);
	assert(typeof first.nextCursor === "string");

	const second = await harness.client.request("tools/list", { cursor: first.nextCursor });
	assertEquals((second.tools as { name: string }[]).map((t) => t.name), ["tool-2", "tool-3"]);

	const third = await harness.client.request("tools/list", { cursor: second.nextCursor });
	assertEquals((third.tools as { name: string }[]).map((t) => t.name), ["tool-4"]);
	assertEquals(third.nextCursor, undefined);

	const error = await assertRejects(
		() => harness.client.request("tools/list", { cursor: "bogus!!" }),
		RpcFailure,
	);
	assertEquals(error.code, ErrorCode.InvalidParams);
});

// ─── Logging, progress, cancellation ──────────────────────────────────────────

Deno.test("logging/setLevel filters notifications/message", async () => {
	await using harness = await connect(() => {});

	harness.server.log("debug", "too quiet");
	assertEquals(harness.client.notificationsOf("notifications/message").length, 0);

	harness.server.log("warning", "loud enough");
	assertEquals(harness.client.notificationsOf("notifications/message").length, 1);

	await harness.client.request("logging/setLevel", { level: "debug" });
	harness.server.log("debug", "now audible");
	assertEquals(harness.client.notificationsOf("notifications/message").length, 2);

	const error = await assertRejects(
		() => harness.client.request("logging/setLevel", { level: "chatty" }),
		RpcFailure,
	);
	assertEquals(error.code, ErrorCode.InvalidParams);
});

Deno.test("progress is reported only when the client supplies a token", async () => {
	await using harness = await connect((server) =>
		server.addTool({
			name: "work",
			handler: (_args, ctx) => {
				ctx.progress(1, 2, "halfway");
				return "done";
			},
		})
	);

	await harness.client.request("tools/call", { name: "work" });
	assertEquals(harness.client.notificationsOf("notifications/progress").length, 0);

	await harness.client.request("tools/call", {
		name: "work",
		_meta: { progressToken: "abc" },
	});
	const [progress] = harness.client.notificationsOf("notifications/progress");
	assertEquals(progress.params, {
		progressToken: "abc",
		progress: 1,
		total: 2,
		message: "halfway",
	});
});

Deno.test("a cancelled request aborts its handler and sends no response", async () => {
	let aborted = false;
	await using harness = await connect((server) =>
		server.addTool({
			name: "slow",
			handler: (_args, ctx) =>
				new Promise<string>((resolve) => {
					ctx.signal.addEventListener("abort", () => {
						aborted = true;
						resolve("late");
					});
				}),
		})
	);

	let settled = false;
	harness.client.request("tools/call", { name: "slow" })
		.then(() => settled = true, () => settled = true);

	await new Promise((resolve) => setTimeout(resolve, 0));
	harness.client.notify("notifications/cancelled", { requestId: 2, reason: "user cancelled" });
	await new Promise((resolve) => setTimeout(resolve, 10));

	assert(aborted, "the handler's signal fired");
	assert(!settled, "no response was sent for the cancelled request");
});

// ─── Server-initiated requests ────────────────────────────────────────────────

Deno.test("listRoots round-trips through the client", async () => {
	await using harness = await connect(() => {}, {}, { roots: { listChanged: true } });

	harness.client.responders.set("roots/list", () => ({
		roots: [{ uri: "file:///workspace", name: "workspace" }],
	}));

	assertEquals(await harness.server.listRoots(), [{
		uri: "file:///workspace",
		name: "workspace",
	}]);
});

Deno.test("client-directed requests refuse unsupported capabilities", async () => {
	await using harness = await connect(() => {});

	await assertRejects(() => harness.server.listRoots(), Error, "roots");
	await assertRejects(() => harness.server.elicit({ message: "hi", requestedSchema: {} }), Error);
});
