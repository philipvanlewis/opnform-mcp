import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Config } from "./config.js";
import type { OpnFormClient } from "./opnform.js";
import { createServer } from "./server.js";

/**
 * Start the MCP server over stdio (for local clients launched via `npx`).
 * NOTE: stdout is the protocol channel — all diagnostics go to stderr.
 */
export async function startStdio(config: Config, client: OpnFormClient): Promise<void> {
  const server = createServer(client, config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[opnform-mcp] ${config.serverName} v${config.serverVersion} (stdio) ready -> ${config.apiBase}`);
}
