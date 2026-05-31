<div align="center">

<img src="assets/social-preview.png" alt="opnform-mcp — Talk to your OpnForm in plain English" width="820" />

<br /><br />

[![npm version](https://img.shields.io/npm/v/opnform-mcp?style=flat-square&color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/opnform-mcp)
[![npm downloads](https://img.shields.io/npm/dm/opnform-mcp?style=flat-square&color=cb3837)](https://www.npmjs.com/package/opnform-mcp)
[![CI](https://img.shields.io/github/actions/workflow/status/philipvanlewis/opnform-mcp/ci.yml?style=flat-square&logo=github&label=CI)](https://github.com/philipvanlewis/opnform-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-7c3aed?style=flat-square)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)

**A [Model Context Protocol](https://modelcontextprotocol.io) server for [OpnForm](https://opnform.com).**
Build forms, read submissions, manage workspaces, and wire up integrations — **27 typed tools** over the OpnForm REST API, from Claude or any MCP client.

</div>

---

> _"List my forms." · "How many applications came in this week?" · "Export submissions to CSV." · "Add a Discord alert to the signup form." · "Create a feedback form with name, email, and a 1–5 rating."_

`opnform-mcp` turns those sentences into real OpnForm API calls. Run it **locally over stdio** (one line in your Claude config) or **remotely over Streamable HTTP** (a hardened, bearer-auth'd container behind your reverse proxy).

## ✨ Features

- **27 tools** covering forms, submissions, workspaces, users, and integrations — full CRUD, not just reads.
- **Two transports:** stdio for local clients (`npx`, zero install) and Streamable HTTP for remote/multi-user setups.
- **Secrets stay server-side.** Your OpnForm token never reaches the model; remote mode adds its own bearer gate (constant-time check).
- **CSV export that just works** — resolves field IDs to human column names and paginates every submission for you.
- **Resilient to OpnForm version drift** — degrades gracefully when a self-hosted build is missing a route.
- **Tiny & typed** — TypeScript, Zod-validated inputs, ~4 runtime deps, multi-stage Docker image.

## 🚀 Quick start (local, 30 seconds)

You need two things from OpnForm: your **API base URL** and a **Personal Access Token** (OpnForm → _Settings → Access Tokens_).

### Claude Desktop

Add this to `claude_desktop_config.json` (Settings → Developer → Edit Config), then restart:

```json
{
  "mcpServers": {
    "opnform": {
      "command": "npx",
      "args": ["-y", "opnform-mcp"],
      "env": {
        "OPNFORM_API_BASE": "https://forms.example.com/api",
        "OPNFORM_API_TOKEN": "your-opnform-token"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add opnform \
  --env OPNFORM_API_BASE=https://forms.example.com/api \
  --env OPNFORM_API_TOKEN=your-opnform-token \
  -- npx -y opnform-mcp
```

That's it — ask Claude _"list my OpnForm forms."_

## 🧰 Tools

| Area | Tools |
|------|-------|
| **Identity** | `whoami` |
| **Forms** | `list_forms` · `list_workspace_forms` · `get_form` · `create_form` · `update_form` · `delete_form` · `duplicate_form` |
| **Submissions** | `list_submissions` · `get_submission` · `update_submission` · `delete_submission` · `export_submissions_csv` |
| **Workspaces** | `list_workspaces` · `create_workspace` · `update_workspace` · `delete_workspace` |
| **Workspace users** | `list_workspace_users` · `add_workspace_user` · `remove_workspace_user` · `update_workspace_user_role` · `list_workspace_invites` |
| **Integrations** | `list_integrations` · `create_integration` · `update_integration` · `delete_integration` · `list_integration_events` |

Every tool has a typed (Zod) input schema and returns clean JSON. `create_form` accepts a simple `properties` array (field IDs and select-option IDs are auto-generated). `export_submissions_csv` returns ready-to-open CSV with real column headers.

## 📦 Install & run

`opnform-mcp` has two modes. The CLI defaults to **stdio**; pass `--http` (or `MCP_TRANSPORT=http`) for the remote server.

```bash
# stdio (local clients launch this for you via npx)
OPNFORM_API_BASE=… OPNFORM_API_TOKEN=… npx -y opnform-mcp

# HTTP (remote): also needs a bearer token clients will send
OPNFORM_API_BASE=… OPNFORM_API_TOKEN=… MCP_BEARER_TOKEN=$(openssl rand -hex 32) \
  npx -y opnform-mcp --http     # listens on 0.0.0.0:8080, endpoint POST /mcp
```

### Docker (HTTP mode)

```bash
cp .env.example .env   # fill in OPNFORM_API_BASE, OPNFORM_API_TOKEN, MCP_BEARER_TOKEN
docker compose up -d --build
curl -s localhost:8080/health
```

### From source

```bash
git clone https://github.com/philipvanlewis/opnform-mcp.git
cd opnform-mcp && npm install && npm run build
npm start            # stdio   |   npm run start:http   # http
```

## ⚙️ Configuration

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `OPNFORM_API_BASE` | ✅ | — | OpnForm REST base, no trailing slash (e.g. `https://forms.example.com/api`). |
| `OPNFORM_API_TOKEN` | ✅ | — | OpnForm Personal Access Token. Server-side only. |
| `MCP_BEARER_TOKEN` | HTTP only | — | Token(s) clients must send (`Authorization: Bearer …`). Comma-separate for several. |
| `HOST` / `PORT` | — | `0.0.0.0` / `8080` | HTTP bind. |
| `MCP_TRANSPORT` | — | `stdio` | `stdio` or `http` (or pass `--stdio` / `--http`). |
| `MCP_SERVER_NAME` / `MCP_SERVER_VERSION` | — | `opnform-mcp` / pkg | Identity reported to clients. |

## 🔌 Connect any client

<details>
<summary><strong>Cursor</strong> (<code>.cursor/mcp.json</code>)</summary>

```json
{
  "mcpServers": {
    "opnform": {
      "command": "npx",
      "args": ["-y", "opnform-mcp"],
      "env": { "OPNFORM_API_BASE": "https://forms.example.com/api", "OPNFORM_API_TOKEN": "your-token" }
    }
  }
}
```
</details>

<details>
<summary><strong>Remote HTTP server</strong> (Claude Desktop / Code → a deployed instance)</summary>

```json
{
  "mcpServers": {
    "opnform": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer your-mcp-bearer-token" }
    }
  }
}
```
Claude Code: `claude mcp add --transport http opnform https://mcp.example.com/mcp --header "Authorization: Bearer …"`
</details>

## 🌐 Remote deployment

HTTP mode is a stateless Streamable-HTTP server. Bind it to loopback and put TLS in front (a reverse proxy or a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)); never expose it without `MCP_BEARER_TOKEN`. The included `docker-compose.yml` binds `127.0.0.1:8080` by default for exactly this pattern.

## 🔒 Security model

- **Two layers:** clients authenticate to the server with a bearer token; the server authenticates to OpnForm with the PAT. The PAT is never returned to clients.
- Bearer tokens are compared in **constant time**; `/health` and `/` expose status only (no data).
- stdio mode has no network surface — it speaks to one local parent process.
- No secrets are written to logs. In stdio mode all diagnostics go to stderr (stdout is the protocol channel).

## 🏗️ Architecture

```mermaid
flowchart LR
  C["MCP client<br/>(Claude Desktop / Code / Cursor)"]
  subgraph S["opnform-mcp"]
    direction TB
    T["stdio · or · Streamable HTTP<br/>(bearer-gated)"]
    K["27 typed tools"]
  end
  O["OpnForm REST API<br/>/api/open/*"]
  C -->|MCP| T --> K -->|PAT| O
```

## 🛠️ Development

```bash
npm run dev            # stdio, watch mode (tsx)
npm run dev:http       # http,  watch mode
npm run typecheck      # tsc --noEmit
npm run build          # -> dist/
# end-to-end smoke test against a running HTTP instance:
MCP_URL=http://localhost:8080/mcp MCP_BEARER_TOKEN=… OPNFORM_API_BASE=… npm run smoke
```

## 🤝 Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md). Found a security issue? See [SECURITY.md](SECURITY.md).

## 📄 License

[MIT](LICENSE) © Philip van Lewis. Not affiliated with OpnForm or Anthropic.
Built on the [OpnForm](https://github.com/JhumanJ/OpnForm) API and the [Model Context Protocol](https://github.com/modelcontextprotocol).
