# Security Policy

## Reporting a vulnerability

Please report security issues **privately** via GitHub Security Advisories:
[Report a vulnerability](https://github.com/philipvanlewis/opnform-mcp/security/advisories/new).

Do not open a public issue for security problems. We'll acknowledge within a few days and keep you updated on a fix and disclosure timeline.

## Supported versions

The latest published `0.x` release receives security fixes.

## Security model (what to keep in mind when deploying)

- **The OpnForm token is the crown jewel.** It lives only in the server's environment and is never returned to MCP clients. Anyone who can run a tool acts with that token's abilities — scope it appropriately in OpnForm.
- **HTTP mode requires `MCP_BEARER_TOKEN`.** Never expose the HTTP endpoint without it. Bind to loopback and terminate TLS in a reverse proxy or tunnel; bearer tokens are compared in constant time.
- **stdio mode has no network surface** — it trusts its local parent process. Treat the env (which holds the token) accordingly.
- The server makes outbound requests only to the configured `OPNFORM_API_BASE`. Point it only at OpnForm instances you trust.
- No tokens or submission data are written to logs.
