/**
 * A small but complete stdio MCP server. Run it and pipe JSON-RPC at it:
 *
 * ```bash
 * deno run mcp/example.ts
 * ```
 */

import { s } from "@bearmetal/forge";
import { logToStderr, McpServer, RpcError, StdioTransport } from "./mod.ts";

const notes = new Map<string, string>([
	["welcome", "Hello from @bearmetal/mcp"],
	["todo", "Write more notes"],
]);

const server = new McpServer({
	serverInfo: { name: "bearmetal-mcp-example", version: "0.1.0" },
	instructions: "A notes server. Read notes with note://<id>, add them with add_note.",
});

server.addTool({
	name: "add_note",
	description: "Store a note under an id",
	inputSchema: s.object({ id: s.string(), body: s.string() }),
	annotations: { idempotentHint: true },
	handler: ({ id, body }) => {
		notes.set(id, body);
		server.notifyResourceUpdated(`note://${id}`);
		return `Saved note "${id}"`;
	},
});

server.addTool({
	name: "count_notes",
	description: "How many notes exist",
	outputSchema: s.object({ count: s.number() }),
	handler: () => ({ count: notes.size }),
});

server.addResourceTemplate({
	uriTemplate: "note://{id}",
	name: "note",
	description: "A stored note",
	mimeType: "text/markdown",
	read: ({ uri, params }) => {
		const body = notes.get(params.id);
		if (body === undefined) throw RpcError.resourceNotFound(uri);
		return body;
	},
	list: () => [...notes.keys()].map((id) => ({ uri: `note://${id}`, name: id })),
	complete: {
		id: (value) => [...notes.keys()].filter((id) => id.startsWith(value)),
	},
});

server.addPrompt({
	name: "summarize",
	description: "Summarize a stored note",
	argumentSchema: s.object({ id: s.string().describe("The note id") }),
	complete: { id: (value) => [...notes.keys()].filter((id) => id.startsWith(value)) },
	handler: ({ id }) => `Summarize this note in one sentence:\n\n${notes.get(id) ?? "(missing)"}`,
});

if (import.meta.main) {
	logToStderr("example MCP server listening on stdio");
	await server.connect(new StdioTransport());
}
