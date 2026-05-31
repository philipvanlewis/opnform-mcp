// Smoke test against a RUNNING HTTP instance of opnform-mcp.
// create_form (MCP) -> submit answer (OpnForm public API) -> read back +
// export CSV (MCP) -> delete_submission -> delete_form -> confirm gone.
//
// Required env:
//   MCP_URL           e.g. http://localhost:8080/mcp  (or your remote /mcp)
//   MCP_BEARER_TOKEN  the bearer token the server expects
//   OPNFORM_API_BASE  e.g. https://forms.example.com/api
//
// Run:  MCP_URL=... MCP_BEARER_TOKEN=... OPNFORM_API_BASE=... npm run smoke

const MCP_URL = process.env.MCP_URL;
const FORMS_API = process.env.OPNFORM_API_BASE;
const TOKEN = process.env.MCP_BEARER_TOKEN || process.env.OPNFORM_MCP_TOKEN;
for (const [k, v] of Object.entries({ MCP_URL, OPNFORM_API_BASE: FORMS_API, MCP_BEARER_TOKEN: TOKEN })) {
  if (!v) { console.error(`Missing required env: ${k}`); process.exit(1); }
}

let rpcId = 0;
const parseSse = (text) => {
  const line = text.split(/\r?\n/).find((l) => l.startsWith("data:"));
  return JSON.parse(line ? line.slice(5).trim() : text);
};
async function rpc(method, params) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const env = parseSse(await res.text());
  if (env.error) throw new Error(`RPC ${method} error: ${JSON.stringify(env.error)}`);
  return env.result;
}
async function tool(name, args = {}) {
  const r = await rpc("tools/call", { name, arguments: args });
  const text = r.content?.[0]?.text ?? "";
  if (r.isError) throw new Error(`tool ${name} error:\n${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

const log = (...a) => console.log(...a);
let formId = null;
try {
  log("1) create_form …");
  const form = await tool("create_form", {
    title: "opnform-mcp smoke test (delete me)",
    workspace_id: 1,
    visibility: "public",
    properties: [
      { name: "Tester name", type: "text", required: false },
      { name: "Tester email", type: "email", required: false },
    ],
  });
  formId = form.id;
  const slug = form.slug;
  const props = form.properties || [];
  log(`   id=${form.id} slug=${slug}`);

  log("2) submit a public answer …");
  const nameId = props.find((p) => p.type === "text").id;
  const emailId = props.find((p) => p.type === "email").id;
  const res = await fetch(`${FORMS_API}/forms/${slug}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ [nameId]: "Smoke Tester", [emailId]: "smoke@example.test" }),
  });
  log(`   answer HTTP ${res.status}`);
  if (!res.ok) throw new Error("submission failed");
  await new Promise((r) => setTimeout(r, 2500));

  log("3) list_submissions …");
  const list = await tool("list_submissions", { form_id: formId });
  const sub = (list.data || [])[0];
  if (!sub || sub.data?.[nameId] !== "Smoke Tester") throw new Error("submission not read back");
  log(`   ok — ${list.meta?.total ?? 1} submission(s)`);

  log("4) export_submissions_csv …");
  const csv = await tool("export_submissions_csv", { form_id: formId });
  log(csv.split("\n").slice(0, 4).map((l) => "   " + l).join("\n"));

  log("5) delete_submission + delete_form …");
  await tool("delete_submission", { form_id: formId, submission_id: sub.id });
  await tool("delete_form", { form_id: formId });
  formId = null;

  log("\n✅ smoke test PASSED");
} catch (err) {
  console.error("\n❌ smoke test FAILED:", err.message);
  if (formId) { try { await tool("delete_form", { form_id: formId }); } catch {} }
  process.exit(1);
}
