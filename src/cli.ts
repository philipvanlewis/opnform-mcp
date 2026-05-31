#!/usr/bin/env node
import { loadConfig, type Transport } from "./config.js";
import { OpnFormClient } from "./opnform.js";
import { startStdio } from "./stdio.js";
import { startHttp } from "./http.js";

function pickTransport(): Transport {
  const args = process.argv.slice(2);
  if (args.includes("--http")) return "http";
  if (args.includes("--stdio")) return "stdio";
  const envTransport = (process.env.MCP_TRANSPORT || "").toLowerCase();
  if (envTransport === "http") return "http";
  if (envTransport === "stdio") return "stdio";
  return "stdio"; // default: stdio is the npx-friendly local mode
}

const transport = pickTransport();
const config = loadConfig(transport);
const client = new OpnFormClient(config.apiBase, config.apiToken);

if (transport === "http") {
  startHttp(config, client);
} else {
  startStdio(config, client).catch((err) => {
    console.error("[opnform-mcp] fatal:", err);
    process.exit(1);
  });
}
