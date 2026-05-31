# Contributing to opnform-mcp

Thanks for helping out! This is a small, focused codebase — contributions of all sizes are welcome.

## Dev setup

```bash
npm install
npm run dev          # stdio, watch mode
npm run dev:http     # http,  watch mode
npm run typecheck
npm run build
```

Provide `OPNFORM_API_BASE` and `OPNFORM_API_TOKEN` (and `MCP_BEARER_TOKEN` for http) via env or a local `.env` (git-ignored). Point at a throwaway OpnForm workspace for testing.

## Project layout

| File | Role |
|------|------|
| `src/opnform.ts` | Thin typed client over the OpnForm REST API. |
| `src/tools.ts` | Tool registrations (Zod input schemas + handlers). |
| `src/server.ts` | Builds the `McpServer` and registers tools. |
| `src/http.ts` / `src/stdio.ts` | The two transports. |
| `src/cli.ts` | Entry point / transport dispatcher (`bin`). |

## Adding a tool

1. Add a method to `OpnFormClient` (`src/opnform.ts`) mapping to the OpnForm route.
2. Register it in `src/tools.ts` with a Zod `inputSchema` and a clear `description`.
3. Keep handlers thin — return `textResult(...)`; let `run()` handle errors.
4. `npm run build` and exercise it (see `npm run smoke`).

## Conventions

- TypeScript, ESM, `NodeNext` — relative imports end in `.js`.
- Validate all tool inputs with Zod. Never trust client input into URLs/bodies blindly.
- **Never** log tokens or submission PII. In stdio mode, nothing may write to stdout except the protocol.
- Match the surrounding style (2-space indent, see `.editorconfig`).

## Submitting

Open a PR against `main`, fill in the template, make sure CI (typecheck + build + docker) is green. By contributing you agree your work is licensed under the project's [MIT License](LICENSE).
