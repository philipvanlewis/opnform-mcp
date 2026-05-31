/**
 * Thin typed client over the OpnForm REST API.
 *
 * All admin endpoints live under `${apiBase}/open/...` and authenticate with a
 * Personal Access Token (Sanctum) sent as `Authorization: Bearer <PAT>`.
 * Route ground-truth: OpnForm/api/routes/api.php.
 */

export type QueryValue = string | number | boolean | undefined | null;

/** Encode a value for safe interpolation as a single URL path segment. */
const seg = (value: string | number): string => encodeURIComponent(String(value));

export class OpnFormError extends Error {
  constructor(
    public readonly status: number,
    public readonly method: string,
    public readonly path: string,
    public readonly body: unknown,
  ) {
    super(`OpnForm API ${status} on ${method} ${path}`);
    this.name = "OpnFormError";
  }
}

export class OpnFormClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  async request<T = any>(
    method: string,
    path: string,
    opts: { query?: Record<string, QueryValue>; body?: unknown } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };
    let payload: string | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(opts.body);
    }

    const res = await fetch(this.buildUrl(path, opts.query), { method, headers, body: payload });
    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!res.ok) {
      throw new OpnFormError(res.status, method, path, parsed ?? text);
    }
    return parsed as T;
  }

  // ---- Identity -----------------------------------------------------------
  whoami() {
    return this.request("GET", "/user");
  }

  // ---- Forms --------------------------------------------------------------
  listForms() {
    // indexAll: every form across the user's workspaces -> { data: [...] }
    return this.request("GET", "/open/forms");
  }

  listWorkspaceForms(workspaceId: number | string) {
    return this.request("GET", `/open/workspaces/${seg(workspaceId)}/forms`);
  }

  async getForm(idOrSlug: number | string) {
    const resp = await this.request<any>("GET", `/open/forms/${seg(idOrSlug)}`);
    return resp?.data ?? resp;
  }

  async createForm(payload: unknown) {
    const resp = await this.request<any>("POST", "/open/forms", { body: payload });
    return resp?.form ?? resp;
  }

  async updateForm(id: number | string, payload: unknown) {
    const resp = await this.request<any>("PUT", `/open/forms/${seg(id)}`, { body: payload });
    return resp?.form ?? resp;
  }

  deleteForm(id: number | string) {
    return this.request("DELETE", `/open/forms/${seg(id)}`);
  }

  async duplicateForm(id: number | string) {
    const resp = await this.request<any>("POST", `/open/forms/${seg(id)}/duplicate`);
    return resp?.new_form ?? resp;
  }

  // ---- Submissions --------------------------------------------------------
  listSubmissions(
    formId: number | string,
    query: { page?: number; per_page?: number; search?: string; status?: string } = {},
  ) {
    return this.request("GET", `/open/forms/${seg(formId)}/submissions`, { query });
  }

  async getSubmission(formId: number | string, submissionId: number | string) {
    try {
      return await this.request("GET", `/open/forms/${seg(formId)}/submissions/${seg(submissionId)}`);
    } catch (err) {
      // Some self-hosted builds don't register GET on the single-submission route
      // (returns 405) — fall back to locating the row in the paginated list.
      if (err instanceof OpnFormError && (err.status === 405 || err.status === 404)) {
        const row = await this.findSubmission(formId, submissionId);
        if (row) return row;
      }
      throw err;
    }
  }

  /** Find a submission by numeric id OR its submission_id identifier. */
  async findSubmission(formId: number | string, idOrIdentifier: number | string): Promise<any | null> {
    const target = String(idOrIdentifier);
    const all = await this.allSubmissions(formId);
    return all.find((s) => String(s?.id) === target || String(s?.submission_id) === target) ?? null;
  }

  /** PUT/DELETE on submissions key off the numeric id; resolve identifiers to it. */
  private async resolveSubmissionNumericId(
    formId: number | string,
    idOrIdentifier: number | string,
  ): Promise<string> {
    const value = String(idOrIdentifier);
    if (/^\d+$/.test(value)) return value;
    const row = await this.findSubmission(formId, idOrIdentifier);
    if (!row) {
      throw new OpnFormError(404, "GET", `/open/forms/${seg(formId)}/submissions`, `Submission "${value}" not found.`);
    }
    return String(row.id);
  }

  async updateSubmission(formId: number | string, submissionId: number | string, data: unknown) {
    const numericId = await this.resolveSubmissionNumericId(formId, submissionId);
    return this.request("PUT", `/open/forms/${seg(formId)}/submissions/${seg(numericId)}`, { body: data });
  }

  async deleteSubmission(formId: number | string, submissionId: number | string) {
    const numericId = await this.resolveSubmissionNumericId(formId, submissionId);
    return this.request("DELETE", `/open/forms/${seg(formId)}/submissions/${seg(numericId)}`);
  }

  /** Fetch every submission across all pages (used to build CSV exports). */
  async allSubmissions(formId: number | string): Promise<any[]> {
    const out: any[] = [];
    let page = 1;
    for (;;) {
      const resp = await this.request<any>("GET", `/open/forms/${seg(formId)}/submissions`, {
        query: { page, per_page: 100 },
      });
      const data: any[] = Array.isArray(resp?.data) ? resp.data : [];
      out.push(...data);
      const lastPage: number = resp?.meta?.last_page ?? 1;
      if (data.length === 0 || page >= lastPage) break;
      page += 1;
      if (page > 1000) break; // hard safety stop
    }
    return out;
  }

  // ---- Workspaces ---------------------------------------------------------
  listWorkspaces() {
    return this.request("GET", "/open/workspaces");
  }

  createWorkspace(payload: unknown) {
    return this.request("POST", "/open/workspaces/create", { body: payload });
  }

  updateWorkspace(id: number | string, payload: unknown) {
    return this.request("PUT", `/open/workspaces/${seg(id)}`, { body: payload });
  }

  deleteWorkspace(id: number | string) {
    return this.request("DELETE", `/open/workspaces/${seg(id)}`);
  }

  // ---- Workspace users / invites -----------------------------------------
  listWorkspaceUsers(workspaceId: number | string) {
    return this.request("GET", `/open/workspaces/${seg(workspaceId)}/users`);
  }

  addWorkspaceUser(workspaceId: number | string, body: { email: string; role: string }) {
    return this.request("POST", `/open/workspaces/${seg(workspaceId)}/users/add`, { body });
  }

  removeWorkspaceUser(workspaceId: number | string, userId: number | string) {
    return this.request("DELETE", `/open/workspaces/${seg(workspaceId)}/users/${seg(userId)}/remove`);
  }

  updateWorkspaceUserRole(workspaceId: number | string, userId: number | string, role: string) {
    return this.request("PUT", `/open/workspaces/${seg(workspaceId)}/users/${seg(userId)}/update-role`, {
      body: { role },
    });
  }

  listWorkspaceInvites(workspaceId: number | string) {
    return this.request("GET", `/open/workspaces/${seg(workspaceId)}/invites`);
  }

  // ---- Form integrations --------------------------------------------------
  listIntegrations(formId: number | string) {
    return this.request("GET", `/open/forms/${seg(formId)}/integrations`);
  }

  createIntegration(formId: number | string, payload: unknown) {
    return this.request("POST", `/open/forms/${seg(formId)}/integrations`, { body: payload });
  }

  updateIntegration(formId: number | string, integrationId: number | string, payload: unknown) {
    return this.request("PUT", `/open/forms/${seg(formId)}/integrations/${seg(integrationId)}`, { body: payload });
  }

  deleteIntegration(formId: number | string, integrationId: number | string) {
    return this.request("DELETE", `/open/forms/${seg(formId)}/integrations/${seg(integrationId)}`);
  }

  listIntegrationEvents(formId: number | string, integrationId: number | string) {
    return this.request("GET", `/open/forms/${seg(formId)}/integrations/${seg(integrationId)}/events`);
  }
}
