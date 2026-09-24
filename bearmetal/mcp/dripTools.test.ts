import { assert, assertEquals } from "@std/assert";
import { MemoryTransport, server as defaultServer } from "@bearmetal/mcp";
import type { JsonRpcMessage, ToolResult } from "@bearmetal/mcp/types";
import "./dripTools.ts";

// ─── Harness ──────────────────────────────────────────────────────────────────
//
// dripTools.ts registers against the shared default server as a side effect of
// import, so the harness connects to that instance rather than building a
// fresh one (see mcp/server.test.ts for the pattern this mirrors).

class TestClient {
	#transport: MemoryTransport;
	#nextId = 1;
	#pending = new Map<number, { resolve: (v: Record<string, unknown>) => void }>();

	constructor(transport: MemoryTransport) {
		this.#transport = transport;
		transport.start((message) => this.#onMessage(message));
	}

	#onMessage(message: JsonRpcMessage): void {
		if (!("id" in message) || "method" in message) return;
		const pending = this.#pending.get(message.id as number);
		if (!pending) return;
		this.#pending.delete(message.id as number);
		pending.resolve("error" in message ? { error: message.error } : message.result);
	}

	request(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
		const id = this.#nextId++;
		return new Promise((resolve) => {
			this.#pending.set(id, { resolve });
			this.#transport.send({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
		});
	}

	notify(method: string, params?: Record<string, unknown>): void {
		this.#transport.send({ jsonrpc: "2.0", method, ...(params ? { params } : {}) });
	}
}

async function connect(): Promise<{ client: TestClient; close(): Promise<void> }> {
	const server = defaultServer();
	const [serverSide, clientSide] = MemoryTransport.pair();
	const running = server.connect(serverSide);
	const client = new TestClient(clientSide);
	await client.request("initialize", {
		protocolVersion: "2025-06-18",
		capabilities: {},
		clientInfo: { name: "test-client", version: "0.1.0" },
	});
	client.notify("notifications/initialized");
	return {
		client,
		async close() {
			await server.close();
			await running;
		},
	};
}

/** Runs `fn` with the cwd pointed at a scratch directory, so `.bearmetal/drip/themes/*` writes land there instead of the real package tree. */
async function withScratchCwd(fn: () => Promise<void>) {
	const dir = await Deno.makeTempDir();
	const original = Deno.cwd();
	Deno.chdir(dir);
	try {
		await fn();
	} finally {
		Deno.chdir(original);
		await Deno.remove(dir, { recursive: true });
	}
}

async function callTool(
	client: TestClient,
	name: string,
	args: Record<string, unknown>,
): Promise<ToolResult> {
	return await client.request("tools/call", { name, arguments: args }) as unknown as ToolResult;
}

/** True only for a genuine tool success — not a schema-level RPC rejection, which has no `isError` field at all. */
function toolSucceeded(result: ToolResult): boolean {
	return !("error" in result) && result.isError !== true;
}

function toolText(result: ToolResult): string {
	return (result.content?.[0] as { text?: string })?.text ?? "";
}

// ─── create_theme: alias ───────────────────────────────────────────────────────

Deno.test("create_theme writes a semantic ramp as a full alias, not a fresh scale", async () => {
	await withScratchCwd(async () => {
		const { client, close } = await connect();
		try {
			const seeded = await callTool(client, "create_theme", {
				themeName: "probe",
				colors: [{ name: "red", identity: "#c00000", stop: "500" }],
			});
			assert(toolSucceeded(seeded), JSON.stringify(seeded));

			const aliased = await callTool(client, "create_theme", {
				themeName: "probe",
				colors: [{ name: "danger", alias: "red" }],
			});
			assert(toolSucceeded(aliased), JSON.stringify(aliased));

			const theme = JSON.parse(
				await Deno.readTextFile(".bearmetal/drip/themes/probe.theme.json"),
			);
			assertEquals(theme.color.danger["500"], "$color.red.500");
			assertEquals(theme.color.danger.base, "$color.red");
		} finally {
			await close();
		}
	});
});

Deno.test("create_theme rejects alias combined with identity", async () => {
	await withScratchCwd(async () => {
		const { client, close } = await connect();
		try {
			const result = await callTool(client, "create_theme", {
				themeName: "probe",
				colors: [{ name: "danger", identity: "#c00000", alias: "red" }],
			});
			assertEquals(result.isError, true);
		} finally {
			await close();
		}
	});
});

Deno.test("create_theme rejects an alias that isn't a required hue", async () => {
	await withScratchCwd(async () => {
		const { client, close } = await connect();
		try {
			// "brand" isn't one of the eight required hues, so the `alias` enum in
			// the input schema rejects it before the handler's own `isHueRampName`
			// check would even run — this is a schema-level RPC error, not a tool
			// isError result.
			const result = await callTool(client, "create_theme", {
				themeName: "probe",
				colors: [{ name: "danger", alias: "brand" }],
			});
			assert(!toolSucceeded(result));
			assert("error" in result, JSON.stringify(result));
		} finally {
			await close();
		}
	});
});

Deno.test("create_theme reports which required ramps are still missing", async () => {
	await withScratchCwd(async () => {
		const { client, close } = await connect();
		try {
			const result = await callTool(client, "create_theme", {
				themeName: "probe",
				colors: [{ name: "brand", identity: "#4a0080", stop: "500" }],
			});
			assert(toolSucceeded(result), JSON.stringify(result));
			const text = toolText(result);
			assert(text.includes("missing"), text);
			assert(text.includes("accent"), text);
		} finally {
			await close();
		}
	});
});

// ─── add_theme_variant: default requires every token ───────────────────────────

Deno.test("add_theme_variant rejects an incomplete default variant", async () => {
	await withScratchCwd(async () => {
		const { client, close } = await connect();
		try {
			await callTool(client, "create_theme", {
				themeName: "probe",
				colors: [{ name: "brand", identity: "#4a0080", stop: "500" }],
			});
			const result = await callTool(client, "add_theme_variant", {
				theme: "probe",
				variant: { name: "light", default: true, bg: "#ffffff", text: "#101014" },
			});
			assert(!toolSucceeded(result));
			assertEquals(result.isError, true);
			assert(toolText(result).includes("every token"), toolText(result));
		} finally {
			await close();
		}
	});
});

Deno.test("add_theme_variant accepts a default variant that sets every token", async () => {
	await withScratchCwd(async () => {
		const { client, close } = await connect();
		try {
			const { VARIANT_TOKENS } = await import("@bearmetal/drip");
			const variant: Record<string, unknown> = { name: "light", default: true };
			for (const token of VARIANT_TOKENS) variant[token.key] = "#123456";

			const result = await callTool(client, "add_theme_variant", {
				theme: "probe",
				variant,
			});
			assert(toolSucceeded(result), JSON.stringify(result));
		} finally {
			await close();
		}
	});
});

Deno.test("a non-default variant can still be partial — only the default is held to completeness", async () => {
	await withScratchCwd(async () => {
		const { client, close } = await connect();
		try {
			const result = await callTool(client, "add_theme_variant", {
				theme: "probe",
				variant: { name: "dark", bg: "#101014", text: "#ffffff" },
			});
			assert(!result.isError, JSON.stringify(result));
		} finally {
			await close();
		}
	});
});
