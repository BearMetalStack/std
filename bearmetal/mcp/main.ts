import { McpServer, setDefaultServer, startMCP } from "@bearmetal/mcp";

const server = new McpServer();
setDefaultServer(server);

await import("./dripTools.ts");

if (import.meta.main) {
	startMCP();
}
