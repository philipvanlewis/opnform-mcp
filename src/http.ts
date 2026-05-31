import express, { type Request, type Response, type NextFunction } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Config } from "./config.js";
import type { OpnFormClient } from "./opnform.js";
import { createServer } from "./server.js";

/** Start the remote MCP server over Streamable HTTP, gated by a bearer token. */
export function startHttp(config: Config, client: OpnFormClient): void {
  // Pre-hash accepted client tokens for constant-time comparison.
  const allowedHashes = config.bearerTokens.map((t) => createHash("sha256").update(t).digest());

  function tokenAllowed(token: string): boolean {
    const candidate = createHash("sha256").update(token).digest();
    let ok = false;
    for (const allowed of allowedHashes) {
      if (allowed.length === candidate.length && timingSafeEqual(allowed, candidate)) ok = true;
    }
    return ok;
  }

  function bearerAuth(req: Request, res: Response, next: NextFunction): void {
    const raw = req.headers["authorization"];
    const header = Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const token = match?.[1]?.trim();
    if (!token || !tokenAllowed(token)) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="opnform-mcp", error="invalid_token"');
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized: a valid bearer token is required." },
        id: null,
      });
      return;
    }
    next();
  }

  const app = express();
  app.disable("x-powered-by");

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      server: config.serverName,
      version: config.serverVersion,
      transport: "streamable-http",
      endpoint: "/mcp",
    });
  });

  app.get("/", (_req: Request, res: Response) => {
    res
      .type("text/plain")
      .send(
        `${config.serverName} v${config.serverVersion}\n` +
          "OpnForm MCP server (Streamable HTTP).\n" +
          "POST /mcp with a valid 'Authorization: Bearer <token>' header.\n" +
          "GET /health for status.\n",
      );
  });

  // Stateless Streamable-HTTP: a fresh server + transport per request.
  // Bearer auth runs BEFORE body parsing so unauthenticated requests can't
  // force a large JSON parse.
  app.post("/mcp", bearerAuth, express.json({ limit: "4mb" }), async (req: Request, res: Response) => {
    try {
      const server = createServer(client, config);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        Promise.resolve(transport.close()).catch(() => {});
        Promise.resolve(server.close()).catch(() => {});
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[opnform-mcp] error handling MCP request:", err);
      if (!res.headersSent) {
        res
          .status(500)
          .json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
      }
    }
  });

  function methodNotAllowed(_req: Request, res: Response): void {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed. This stateless MCP server only accepts POST /mcp." },
      id: null,
    });
  }
  app.get("/mcp", bearerAuth, methodNotAllowed);
  app.delete("/mcp", bearerAuth, methodNotAllowed);

  app.listen(config.port, config.host, () => {
    console.log(
      `[opnform-mcp] ${config.serverName} v${config.serverVersion} (http) listening on ${config.host}:${config.port} -> upstream ${config.apiBase}`,
    );
  });
}
