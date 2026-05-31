import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OpnFormClient, OpnFormError } from "./opnform.js";

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function textResult(data: unknown): ToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text: text || "(empty response)" }] };
}

function errorResult(err: unknown): ToolResult {
  let text: string;
  if (err instanceof OpnFormError) {
    const body = typeof err.body === "string" ? err.body : JSON.stringify(err.body, null, 2);
    text = `OpnForm API error ${err.status} on ${err.method} ${err.path}\n${body}`;
  } else if (err instanceof Error) {
    text = `${err.name}: ${err.message}`;
  } else {
    text = String(err);
  }
  return { content: [{ type: "text", text }], isError: true };
}

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return textResult(await fn());
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// Form property helpers (mirror the proven build-form.js shape)
// ---------------------------------------------------------------------------

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || randomUUID()
  );
}

/** Ensure each field has a stable id, sane defaults, and option ids for selects. */
function normalizeProperties(props: any[]): any[] {
  if (!Array.isArray(props)) return [];
  return props.map((raw) => {
    const field: any = { hidden: false, required: false, ...raw };
    if (!field.id) field.id = randomUUID();
    if (!field.type) field.type = "text";
    for (const key of ["select", "multi_select"]) {
      const block = field[key];
      if (block && Array.isArray(block.options)) {
        block.options = block.options.map((opt: any) =>
          typeof opt === "string"
            ? { id: slugify(opt), name: opt }
            : { id: opt.id ?? slugify(String(opt.name ?? opt.value ?? "")), name: opt.name ?? String(opt.value ?? ""), ...opt },
        );
      }
    }
    return field;
  });
}

const FORM_DEFAULTS: Record<string, unknown> = {
  visibility: "public",
  language: "en",
  theme: "default",
  color: "#3B82F6",
  presentation_style: "classic",
  width: "centered",
  size: "md",
  border_radius: "small",
  dark_mode: "auto",
  uppercase_labels: false,
  no_branding: false,
  transparent_background: false,
  re_fillable: false,
  use_captcha: false,
  can_be_indexed: true,
  tags: [],
};

function csvCell(value: unknown): string {
  let s: string;
  if (value === null || value === undefined) s = "";
  else if (typeof value === "object") s = JSON.stringify(value);
  else s = String(value);
  // Neutralize spreadsheet formula injection: cells starting with these chars
  // are executed as formulas by Excel/Sheets. Prefix with a single quote.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerTools(server: McpServer, client: OpnFormClient): void {
  // ---- Identity ----------------------------------------------------------
  server.registerTool(
    "whoami",
    {
      title: "Who am I / connection check",
      description:
        "Connectivity + auth check. Returns the OpnForm account the server's token belongs to. " +
        "Some self-hosted builds omit the /user route; if so, this falls back to listing the workspaces the token can access (which still confirms the token is valid).",
      inputSchema: {},
    },
    async () =>
      run(async () => {
        try {
          return await client.whoami();
        } catch (err) {
          if (err instanceof OpnFormError && err.status === 404) {
            const workspaces = await client.listWorkspaces();
            return {
              note: "GET /user is unavailable on this OpnForm build; the token is valid (workspaces listed below).",
              workspaces,
            };
          }
          throw err;
        }
      }),
  );

  // ---- Forms -------------------------------------------------------------
  server.registerTool(
    "list_forms",
    {
      title: "List forms",
      description:
        "List every form across all workspaces the token can access. Returns id, slug, title, visibility, etc.",
      inputSchema: {},
    },
    async () => run(() => client.listForms()),
  );

  server.registerTool(
    "list_workspace_forms",
    {
      title: "List forms in a workspace",
      description: "List forms belonging to a single workspace (paginated).",
      inputSchema: {
        workspace_id: z.number().int().describe("Workspace id (e.g. 1)."),
      },
    },
    async ({ workspace_id }) => run(() => client.listWorkspaceForms(workspace_id)),
  );

  server.registerTool(
    "get_form",
    {
      title: "Get a form",
      description:
        "Fetch one form (with its full `properties` field array) by numeric id or slug. Get the form first when you intend to update it.",
      inputSchema: {
        form: z.union([z.number().int(), z.string()]).describe("Form numeric id or slug."),
      },
    },
    async ({ form }) => run(() => client.getForm(form)),
  );

  server.registerTool(
    "create_form",
    {
      title: "Create a form",
      description:
        "Create a new form. `properties` is the ordered array of fields. Each field: {name, type, required?, help?, ...type-specific}. " +
        "`id` is auto-generated if omitted; for select/multi_select pass `{select:{options:[\"A\",\"B\"]}}` (string options are auto-id'd). " +
        "Common field types: text, email, number, select, multi_select, date, checkbox, url, phone_number, rich_text, files, signature, rating, scale. " +
        "Use `extra` for any other top-level form attributes (color, submit_button_text, submitted_text, description, etc.).",
      inputSchema: {
        title: z.string().describe("Form title."),
        workspace_id: z.number().int().default(1).describe("Workspace id (default 1 — usually your primary workspace)."),
        properties: z
          .array(z.record(z.any()))
          .describe("Ordered array of field objects."),
        description: z.string().optional().describe("Optional form description."),
        visibility: z.enum(["public", "draft", "closed"]).optional().describe("Defaults to public."),
        extra: z
          .record(z.any())
          .optional()
          .describe('Any other top-level form attributes, e.g. {"color":"#2563EB","submit_button_text":"Submit"}.'),
      },
    },
    async ({ title, workspace_id, properties, description, visibility, extra }) =>
      run(() => {
        const payload: Record<string, unknown> = {
          ...FORM_DEFAULTS,
          ...(extra ?? {}),
          title,
          workspace_id,
          properties: normalizeProperties(properties),
        };
        if (description !== undefined) payload.description = description;
        if (visibility !== undefined) payload.visibility = visibility;
        return client.createForm(payload);
      }),
  );

  server.registerTool(
    "update_form",
    {
      title: "Update a form",
      description:
        "Update a form. The current form is fetched and your `patch` is shallow-merged over it (so you only pass the keys you want to change). " +
        "OpnForm replaces the whole form on save, so passing `properties` replaces the entire field array (ids are normalized).",
      inputSchema: {
        form_id: z.number().int().describe("Numeric form id to update."),
        patch: z
          .record(z.any())
          .describe('Top-level fields to change, e.g. {"title":"New title"} or {"properties":[...]}.'),
      },
    },
    async ({ form_id, patch }) =>
      run(async () => {
        const current = await client.getForm(form_id);
        const merged: Record<string, unknown> = { ...current, ...patch };
        if (Array.isArray((merged as any).properties)) {
          (merged as any).properties = normalizeProperties((merged as any).properties);
        }
        return client.updateForm(form_id, merged);
      }),
  );

  server.registerTool(
    "delete_form",
    {
      title: "Delete a form",
      description: "Soft-delete a form by numeric id. This also removes its submissions from the UI.",
      inputSchema: {
        form_id: z.number().int().describe("Numeric form id to delete."),
      },
    },
    async ({ form_id }) => run(() => client.deleteForm(form_id)),
  );

  server.registerTool(
    "duplicate_form",
    {
      title: "Duplicate a form",
      description: "Create a copy of an existing form (new slug, title prefixed with 'Copy of ').",
      inputSchema: {
        form_id: z.number().int().describe("Numeric form id to duplicate."),
      },
    },
    async ({ form_id }) => run(() => client.duplicateForm(form_id)),
  );

  // ---- Submissions -------------------------------------------------------
  server.registerTool(
    "list_submissions",
    {
      title: "List submissions",
      description:
        "List submissions for a form (newest first, paginated, max 100/page). Each row's `data` is keyed by field id. " +
        "Optional `search` matches values; `status` filters all|completed|partial.",
      inputSchema: {
        form_id: z.number().int().describe("Numeric form id."),
        page: z.number().int().min(1).optional().describe("Page number (default 1)."),
        per_page: z.number().int().min(1).max(100).optional().describe("Rows per page (max 100, default 100)."),
        search: z.string().optional().describe("Search term matched against submission values."),
        status: z.enum(["all", "completed", "partial"]).optional().describe("Status filter."),
      },
    },
    async ({ form_id, page, per_page, search, status }) =>
      run(() => client.listSubmissions(form_id, { page, per_page, search, status })),
  );

  server.registerTool(
    "get_submission",
    {
      title: "Get a submission",
      description:
        "Fetch a single submission by numeric id or by its submission_id identifier. `data` is keyed by field id. " +
        "Resilient to builds that don't expose the single-submission GET route (falls back to the list).",
      inputSchema: {
        form_id: z.number().int().describe("Numeric form id."),
        submission_id: z.union([z.number().int(), z.string()]).describe("Submission id."),
      },
    },
    async ({ form_id, submission_id }) => run(() => client.getSubmission(form_id, submission_id)),
  );

  server.registerTool(
    "update_submission",
    {
      title: "Update a submission",
      description:
        "Update a submission's answers. `data` is an object keyed by field id (same shape as a submission's `data`). " +
        "Fetch the submission first to see the field ids.",
      inputSchema: {
        form_id: z.number().int().describe("Numeric form id."),
        submission_id: z.union([z.number().int(), z.string()]).describe("Submission id."),
        data: z.record(z.any()).describe("Answer object keyed by field id, e.g. {\"<field-id>\":\"new value\"}."),
      },
    },
    async ({ form_id, submission_id, data }) =>
      run(() => client.updateSubmission(form_id, submission_id, data)),
  );

  server.registerTool(
    "delete_submission",
    {
      title: "Delete a submission",
      description: "Permanently delete one submission by id.",
      inputSchema: {
        form_id: z.number().int().describe("Numeric form id."),
        submission_id: z.union([z.number().int(), z.string()]).describe("Submission id."),
      },
    },
    async ({ form_id, submission_id }) => run(() => client.deleteSubmission(form_id, submission_id)),
  );

  server.registerTool(
    "export_submissions_csv",
    {
      title: "Export submissions as CSV",
      description:
        "Export ALL submissions of a form as CSV text. Columns are the form's field names (resolved from the form's properties) " +
        "plus submission_id, created_at, status. Returns a summary line followed by the CSV.",
      inputSchema: {
        form_id: z.number().int().describe("Numeric form id."),
      },
    },
    async ({ form_id }) =>
      run(async () => {
        const form: any = await client.getForm(form_id);
        const props: any[] = Array.isArray(form?.properties) ? form.properties : [];
        const fieldCols = props
          .filter((p) => p?.id && !String(p.type ?? "").startsWith("nf-"))
          .map((p) => ({ id: p.id as string, name: String(p.name ?? p.id) }));

        const submissions = await client.allSubmissions(form_id);
        const header = ["submission_id", "created_at", "status", ...fieldCols.map((c) => c.name)];
        const rows = submissions.map((s) => {
          const d = s?.data ?? {};
          return [
            s?.submission_id ?? s?.id ?? "",
            s?.created_at ?? d?.created_at ?? "",
            s?.status ?? d?.status ?? "",
            ...fieldCols.map((c) => d?.[c.id]),
          ];
        });
        const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
        return `Exported ${submissions.length} submission(s) for form ${form_id} (${form?.title ?? ""}).\n\n${csv}`;
      }),
  );

  // ---- Workspaces --------------------------------------------------------
  server.registerTool(
    "list_workspaces",
    {
      title: "List workspaces",
      description: "List all workspaces the token can access.",
      inputSchema: {},
    },
    async () => run(() => client.listWorkspaces()),
  );

  server.registerTool(
    "create_workspace",
    {
      title: "Create a workspace",
      description: "Create a new workspace. Provide a name; use `extra` for other attributes (e.g. emoji/icon).",
      inputSchema: {
        name: z.string().describe("Workspace name."),
        extra: z.record(z.any()).optional().describe("Other workspace attributes, e.g. {\"icon\":\"🐺\"}."),
      },
    },
    async ({ name, extra }) => run(() => client.createWorkspace({ name, ...(extra ?? {}) })),
  );

  server.registerTool(
    "update_workspace",
    {
      title: "Update a workspace",
      description: "Update a workspace's attributes.",
      inputSchema: {
        workspace_id: z.number().int().describe("Workspace id."),
        patch: z.record(z.any()).describe("Attributes to change, e.g. {\"name\":\"My Team\"}."),
      },
    },
    async ({ workspace_id, patch }) => run(() => client.updateWorkspace(workspace_id, patch)),
  );

  server.registerTool(
    "delete_workspace",
    {
      title: "Delete a workspace",
      description: "Delete a workspace by id. Destructive — removes the workspace and its forms.",
      inputSchema: {
        workspace_id: z.number().int().describe("Workspace id."),
      },
    },
    async ({ workspace_id }) => run(() => client.deleteWorkspace(workspace_id)),
  );

  // ---- Workspace users ---------------------------------------------------
  server.registerTool(
    "list_workspace_users",
    {
      title: "List workspace users",
      description: "List members of a workspace (and their roles).",
      inputSchema: {
        workspace_id: z.number().int().describe("Workspace id."),
      },
    },
    async ({ workspace_id }) => run(() => client.listWorkspaceUsers(workspace_id)),
  );

  server.registerTool(
    "add_workspace_user",
    {
      title: "Add / invite a workspace user",
      description:
        "Add a user to a workspace by email. If they already have an OpnForm account they're added directly; " +
        "otherwise an invitation email is sent. Role is one of: admin, user, readonly.",
      inputSchema: {
        workspace_id: z.number().int().describe("Workspace id."),
        email: z.string().email().describe("User email."),
        role: z.enum(["admin", "user", "readonly"]).describe("Role to grant."),
      },
    },
    async ({ workspace_id, email, role }) =>
      run(() => client.addWorkspaceUser(workspace_id, { email, role })),
  );

  server.registerTool(
    "remove_workspace_user",
    {
      title: "Remove a workspace user",
      description: "Remove a user from a workspace by user id.",
      inputSchema: {
        workspace_id: z.number().int().describe("Workspace id."),
        user_id: z.number().int().describe("User id to remove."),
      },
    },
    async ({ workspace_id, user_id }) => run(() => client.removeWorkspaceUser(workspace_id, user_id)),
  );

  server.registerTool(
    "update_workspace_user_role",
    {
      title: "Update a workspace user's role",
      description: "Change a workspace member's role (admin, user, readonly).",
      inputSchema: {
        workspace_id: z.number().int().describe("Workspace id."),
        user_id: z.number().int().describe("User id."),
        role: z.enum(["admin", "user", "readonly"]).describe("New role."),
      },
    },
    async ({ workspace_id, user_id, role }) =>
      run(() => client.updateWorkspaceUserRole(workspace_id, user_id, role)),
  );

  server.registerTool(
    "list_workspace_invites",
    {
      title: "List workspace invites",
      description: "List pending invitations for a workspace.",
      inputSchema: {
        workspace_id: z.number().int().describe("Workspace id."),
      },
    },
    async ({ workspace_id }) => run(() => client.listWorkspaceInvites(workspace_id)),
  );

  // ---- Form integrations -------------------------------------------------
  server.registerTool(
    "list_integrations",
    {
      title: "List form integrations",
      description: "List a form's integrations (webhooks, Discord, email, Google Sheets, etc.).",
      inputSchema: {
        form_id: z.number().int().describe("Numeric form id."),
      },
    },
    async ({ form_id }) => run(() => client.listIntegrations(form_id)),
  );

  server.registerTool(
    "create_integration",
    {
      title: "Create a form integration",
      description:
        "Attach an integration to a form. `integration_id` is the provider key (e.g. webhook, discord, slack, email, google_sheets). " +
        "`data` holds provider-specific config — e.g. webhook => {\"webhook_url\":\"https://...\"}, discord => {\"discord_webhook_url\":\"https://...\"}, " +
        "email => {\"send_to\":\"...\",\"sender_name\":\"...\",\"subject\":\"...\"}. " +
        "Optional `logic` is a conditional-routing object; `oauth_id` is required only for OAuth providers (e.g. google_sheets).",
      inputSchema: {
        form_id: z.number().int().describe("Numeric form id."),
        integration_id: z.string().describe("Provider key, e.g. 'webhook', 'discord', 'email'."),
        data: z.record(z.any()).default({}).describe("Provider-specific settings object."),
        status: z.enum(["active", "inactive"]).default("active").describe("Integration status."),
        logic: z.record(z.any()).optional().describe("Optional conditional-logic object."),
        oauth_id: z.number().int().optional().describe("Connected OAuth account id (only for OAuth providers)."),
      },
    },
    async ({ form_id, integration_id, data, status, logic, oauth_id }) =>
      run(() => {
        const payload: Record<string, unknown> = { integration_id, status, data: data ?? {} };
        if (logic !== undefined) payload.logic = logic;
        if (oauth_id !== undefined) payload.oauth_id = oauth_id;
        return client.createIntegration(form_id, payload);
      }),
  );

  server.registerTool(
    "update_integration",
    {
      title: "Update a form integration",
      description:
        "Update an existing integration. You must resend the full integration payload (integration_id, status, data, optional logic/oauth_id).",
      inputSchema: {
        form_id: z.number().int().describe("Numeric form id."),
        integration_id_ref: z.number().int().describe("The form_integration row id to update."),
        integration_id: z.string().describe("Provider key (e.g. 'webhook')."),
        data: z.record(z.any()).default({}).describe("Provider-specific settings object."),
        status: z.enum(["active", "inactive"]).default("active").describe("Integration status."),
        logic: z.record(z.any()).optional().describe("Optional conditional-logic object."),
        oauth_id: z.number().int().optional().describe("Connected OAuth account id."),
      },
    },
    async ({ form_id, integration_id_ref, integration_id, data, status, logic, oauth_id }) =>
      run(() => {
        const payload: Record<string, unknown> = { integration_id, status, data: data ?? {} };
        if (logic !== undefined) payload.logic = logic;
        if (oauth_id !== undefined) payload.oauth_id = oauth_id;
        return client.updateIntegration(form_id, integration_id_ref, payload);
      }),
  );

  server.registerTool(
    "delete_integration",
    {
      title: "Delete a form integration",
      description: "Remove an integration from a form by its form_integration row id.",
      inputSchema: {
        form_id: z.number().int().describe("Numeric form id."),
        integration_id_ref: z.number().int().describe("The form_integration row id to delete."),
      },
    },
    async ({ form_id, integration_id_ref }) =>
      run(() => client.deleteIntegration(form_id, integration_id_ref)),
  );

  server.registerTool(
    "list_integration_events",
    {
      title: "List integration events",
      description: "List delivery events/history for a specific integration (useful to confirm a webhook fired).",
      inputSchema: {
        form_id: z.number().int().describe("Numeric form id."),
        integration_id_ref: z.number().int().describe("The form_integration row id."),
      },
    },
    async ({ form_id, integration_id_ref }) =>
      run(() => client.listIntegrationEvents(form_id, integration_id_ref)),
  );
}
