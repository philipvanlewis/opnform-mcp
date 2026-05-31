import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version?: string };

export type Transport = "stdio" | "http";

export interface Config {
  transport: Transport;
  apiBase: string;
  apiToken: string;
  /** http only — bearer token(s) clients must present */
  bearerTokens: string[];
  /** http only */
  host: string;
  /** http only */
  port: number;
  serverName: string;
  serverVersion: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(`[opnform-mcp] FATAL: required environment variable ${name} is not set.`);
    process.exit(1);
  }
  return value.trim();
}

export function loadConfig(transport: Transport): Config {
  const apiBase = required("OPNFORM_API_BASE").replace(/\/+$/, "");
  let apiUrl: URL;
  try {
    apiUrl = new URL(apiBase);
  } catch {
    console.error(`[opnform-mcp] FATAL: OPNFORM_API_BASE is not a valid URL: "${apiBase}".`);
    process.exit(1);
  }
  if (apiUrl.protocol !== "https:" && apiUrl.protocol !== "http:") {
    console.error(`[opnform-mcp] FATAL: OPNFORM_API_BASE must use http(s), got "${apiUrl.protocol}".`);
    process.exit(1);
  }
  if (apiUrl.username || apiUrl.password) {
    console.error("[opnform-mcp] FATAL: OPNFORM_API_BASE must not contain embedded credentials.");
    process.exit(1);
  }
  const apiToken = required("OPNFORM_API_TOKEN");

  let bearerTokens: string[] = [];
  let host = "0.0.0.0";
  let port = 8080;

  if (transport === "http") {
    bearerTokens = required("MCP_BEARER_TOKEN")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (bearerTokens.length === 0) {
      console.error("[opnform-mcp] FATAL: MCP_BEARER_TOKEN contained no usable token.");
      process.exit(1);
    }
    host = process.env.HOST || "0.0.0.0";
    port = Number.parseInt(process.env.PORT || "8080", 10);
    if (!Number.isFinite(port) || port <= 0) {
      console.error(`[opnform-mcp] FATAL: invalid PORT "${process.env.PORT}".`);
      process.exit(1);
    }
  }

  return {
    transport,
    apiBase,
    apiToken,
    bearerTokens,
    host,
    port,
    serverName: process.env.MCP_SERVER_NAME || "opnform-mcp",
    serverVersion: process.env.MCP_SERVER_VERSION || pkg.version || "0.0.0",
  };
}
