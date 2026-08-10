# @bearmetal/mcp

A zero-dependency [Model Context Protocol](https://modelcontextprotocol.io) server for Deno.

Speaks protocol revision `2025-06-18` (and accepts `2025-03-26` / `2024-11-05`) over stdio. Tools,
resources, resource templates, prompts, completions, logging, subscriptions, progress and
cancellation are all implemented. Schemas come from [`@bearmetal/forge`](../forge), so a tool's
arguments are validated once and typed for the handler.

> This exists to learn how MCP works. If you want the battle-tested thing, use the official SDK.

## Quick start

```ts
import { McpServer, StdioTransport } from "@bearmetal/mcp";
import { s } from "@bearmetal/forge";

const server = new McpServer({
	serverInfo: { name: "demo", version: "1.0.0" },
	instructions: "Ask me to add numbers.",
});

server.addTool({
	name: "add",
	description: "Add two numbers",
	inputSchema: s.object({ a: s.number(), b: s.number() }),
	handler: ({ a, b }) => String(a + b), // a and b are typed number
});

await server.connect(new StdioTransport());
```

Run it with `deno run mod.ts` and point an MCP client at it. **Never write to stdout** while a stdio
server is running — that stream is protocol traffic. Use `logToStderr()` or `server.log(...)`.

For a throwaway script there is a process-wide default server:

```ts
import { addTools, defineServerInfo, startMCP } from "@bearmetal/mcp";

defineServerInfo({ name: "demo", version: "1.0.0" });
addTools({ name: "ping", handler: () => "pong" });
await startMCP();
```

## Registries

Everything registered lives in a keyed `Registry` exposed on the server — `server.tools`,
`server.resources`, `server.resourceTemplates`, `server.prompts`. Registration order is preserved,
keys are unique (tools and prompts by `name`, resources by `uri`, templates by `uriTemplate`), and
mutations fire the matching `notifications/*/list_changed`.

```ts
server.tools.disable("dangerous"); // registered, but hidden and un-callable
server.tools.enable("dangerous");
server.tools.set(replacement); // replace in place
server.tools.remove("obsolete");
server.tools.get("add"); // the registration, enabled or not
server.tools.keys(); // ["add", "dangerous", ...]
```

Two levers control what a client sees:

```ts
// A static toggle, flipped at runtime.
server.addTool({ name: "admin", handler: doThing }, { enabled: false });

// A per-client predicate, evaluated on every list and lookup.
server.addTool({ name: "beta", handler: doThing }, {
	visible: (ctx) => ctx.client?.info.name === "trusted-client",
});
```

Hidden entries are hidden consistently: absent from `tools/list`, and `tools/call` reports them as
unknown.

Capabilities are derived from what is actually registered — a server with no prompts does not
advertise `prompts`. Pass `capabilities` in the options to merge extras (`experimental`, or forcing
one on).

## Tools

`inputSchema` takes a forge schema (validated, and the handler's argument is typed from it) or a
hand-written JSON Schema (handler receives `Record<string, unknown>`).

Handler returns are normalised:

| Return                      | Result                                          |
| --------------------------- | ----------------------------------------------- |
| `string`                    | one text block                                  |
| `ContentBlock` / an array   | used as the content list                        |
| a plain object              | `structuredContent`, mirrored into a JSON block |
| `{ content, isError, ... }` | passed through                                  |
| `void`                      | empty content                                   |

Errors follow the specification's split: a thrown `Error` becomes an in-band `{ isError: true }`
result the model can read and react to, while protocol faults — an unknown tool, arguments that fail
validation — become JSON-RPC errors. Throw an `RpcError` from a handler to force the latter.

```ts
server.addTool({
	name: "search",
	inputSchema: s.object({ query: s.string(), limit: s.number().optional() }),
	outputSchema: s.object({ hits: s.array(s.string()) }),
	annotations: { readOnlyHint: true },
	handler: async ({ query, limit }, ctx) => {
		ctx.progress(0, 2, "searching");
		const hits = await search(query, limit ?? 10);
		ctx.log("debug", { query, found: hits.length });
		return { hits }; // validated against outputSchema
	},
});
```

## Resources

Static resources are keyed by uri; templates route by an RFC 6570 level-1 pattern — `{var}` matches
one path segment, `{+var}` matches across `/`.

```ts
server.addResource({
	uri: "config://app",
	mimeType: "application/json",
	read: () => JSON.stringify(config), // string, Uint8Array, or ResourceContents
});

server.addResourceTemplate({
	uriTemplate: "note://{id}",
	name: "note",
	mimeType: "text/plain",
	read: (ctx) => Deno.readTextFile(`./notes/${ctx.params.id}.md`),
	list: () => notes.map((n) => ({ uri: `note://${n.id}`, name: n.title })),
	complete: { id: (value) => notes.map((n) => n.id).filter((id) => id.startsWith(value)) },
});
```

A `Uint8Array` return is base64-encoded as a `blob`; a string becomes `text`. Subscriptions are
tracked for you — call `server.notifyResourceUpdated(uri)` and it only emits when somebody
subscribed.

A uri that matches no resource and no template is reported as `-32003 Resource not found`. When a
template matches but the underlying item is missing, say so explicitly — a bare `throw` from a
reader is an internal error, since the template did match:

```ts
if (body === undefined) throw RpcError.resourceNotFound(uri);
```

## Prompts

```ts
server.addPrompt({
	name: "review",
	description: "Review a diff",
	argumentSchema: s.object({ diff: s.string().describe("Unified diff") }),
	handler: ({ diff }) => `Please review:\n\n${diff}`,
});
```

`argumentSchema` produces the `arguments` list clients see, and validates on the way in. Prompt
arguments arrive as strings, so describe string-shaped fields. A raw `arguments: [...]` array works
too. Handlers may return a string, a content block, a message, a message array, or a full result
with a `description`.

## Talking to the client

Guarded by the client's advertised capabilities, so a call against a client that cannot serve it
fails fast rather than hanging:

```ts
const roots = await server.listRoots(); // requires `roots`
const reply = await server.createMessage({ messages, maxTokens: 512 }); // requires `sampling`
const answer = await server.elicit({ message, requestedSchema }); // requires `elicitation`
await server.ping();
```

`server.ready` resolves with the client snapshot once the handshake completes.

## Handler context

Every handler receives a `RequestContext` as its second argument:

| Member                        | Purpose                                                           |
| ----------------------------- | ----------------------------------------------------------------- |
| `client`                      | Client name, version and capabilities                             |
| `signal`                      | Aborts on `notifications/cancelled` or transport close            |
| `progress(n, total?, msg?)`   | Emits progress — a no-op unless the client sent a `progressToken` |
| `log(level, data)`            | Emits `notifications/message`, filtered by `logging/setLevel`     |
| `server`                      | The server, for registry mutation mid-request                     |
| `requestId`, `method`, `meta` | The request being served                                          |

Resource readers additionally get `uri` and `params` (captured template variables).

## Pagination

Set `pageSize` in the options and every list endpoint paginates with an opaque `nextCursor`. Left
unset, lists return in a single page.

## Transports

`StdioTransport` is the shipped one. `MemoryTransport.pair()` wires two ends together in-process,
which is how the test-suite drives a server and is useful for embedding one. Both implement the
`Transport` interface, so an HTTP transport can be added without touching `McpServer`.

## Testing

```bash
cd mcp && deno test
```
