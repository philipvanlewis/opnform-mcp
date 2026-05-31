import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "./config.js";
import { OpnFormClient } from "./opnform.js";
import { registerTools } from "./tools.js";

/**
 * Build a fresh McpServer with all OpnForm tools registered.
 * In stateless Streamable-HTTP mode we create one per request; the
 * OpnFormClient is shared (it is stateless).
 */
export function createServer(client: OpnFormClient, config: Config): McpServer {
  const server = new McpServer({
    name: config.serverName,
    version: config.serverVersion,
  });
  registerTools(server, client);
  return server;
}
