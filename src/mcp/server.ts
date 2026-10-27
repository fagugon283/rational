// MCP server: the interface agents of any vendor speak to. Every tool is a thin
// wrapper over the core, so the CLI and MCP never drift apart.
// @why: D-0024
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { requirePaths } from "../core/paths.js";
import { loadConfig } from "../core/config.js";
import { verify } from "../core/verify.js";
import * as decisions from "../stores/decisions.js";
import * as tasks from "../stores/tasks.js";
import * as memory from "../stores/memory.js";
import * as knowledge from "../stores/knowledge.js";
import * as traceability from "../stores/traceability.js";
import { getContext } from "../retrieval/context.js";
import { rebuild, search } from "../retrieval/index.js";
import { analyze, adopt } from "../adopt/adopt.js";

/** Wrap any JSON-serializable value as MCP text content. */
function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}
function cfg() {
  return loadConfig(requirePaths());
}

export function buildServer(): McpServer {
  const server = new McpServer({ name: "rational-agnostic", version: "0.1.0" });

  server.tool(
    "whoami",
    "Return a vendor-neutral agent identity to use for attribution.",
    { vendor: z.string(), name: z.string() },
    async ({ vendor, name }) => json({ id: `agent:${vendor}:${name}` }),
  );

  // ---- context & search (token-saving retrieval) ----
  server.tool(
    "get_context",
    "Assemble a token-budgeted bundle of the most relevant task, decisions, learnings and shared memory. Call this FIRST.",
    {
      query: z.string().optional(),
      taskId: z.string().optional(),
      budgetTokens: z.number().int().positive().optional(),
    },
    async (a) => json(await getContext(a, cfg())),
  );
  server.tool(
    "search",
    "Semantic search across decisions, tasks, learnings and shared memory.",
    {
      query: z.string(),
      topK: z.number().int().positive().optional(),
      kinds: z.array(z.enum(["decision", "task", "learning", "memory"])).optional(),
    },
    async ({ query, topK, kinds }) => json(await search(query, cfg(), { topK, kinds })),
  );
  server.tool("reindex", "Rebuild the semantic index from the stores.", {}, async () =>
    json({ indexed: await rebuild(cfg()) }),
  );

  // ---- tasks ----
  server.tool("list_tasks", "List tasks, optionally filtered by status.", { status: z.string().optional() }, async ({ status }) => {
    const paths = requirePaths();
    let all = tasks.all(paths);
    if (status) all = all.filter((t) => t.status === status);
    return json(all.map(({ body, ...rest }) => rest));
  });
  server.tool("get_task", "Get one task by id.", { id: z.string() }, async ({ id }) =>
    json(tasks.get(requirePaths(), id)),
  );
  server.tool(
    "create_task",
    "Create a task. Summaries must be in English.",
    {
      title: z.string(),
      summary: z.string(),
      goal: z.string().optional(),
      assignee: z.string().optional(),
      status: z.enum(["backlog", "todo", "doing", "review", "blocked", "done"]).optional(),
    },
    async (a) => json(await tasks.create(a)),
  );
  server.tool(
    "set_task_status",
    "Update a task's status (backlog|todo|doing|review|blocked|done).",
    {
      id: z.string(),
      status: z.enum(["backlog", "todo", "doing", "review", "blocked", "done"]),
      assignee: z.string().optional(),
      note: z.string().optional(),
    },
    async ({ id, status, assignee, note }) =>
      json(await tasks.setStatus(id, status, { assignee, note })),
  );

  // ---- decisions ----
  server.tool(
    "record_decision",
    "Record a decision (Context/Decision/Why/Consequences), in English. Returns an id to put in a `// @why:` comment.",
    {
      title: z.string(),
      summary: z.string(),
      context: z.string(),
      decision: z.string(),
      why: z.string(),
      consequences: z.string().optional(),
      author: z.string(),
      task: z.string().optional(),
      status: z.enum(["proposed", "accepted", "superseded", "deprecated"]).optional(),
      tags: z.array(z.string()).optional(),
    },
    async (a) => json(await decisions.create(a)),
  );
  server.tool("get_decision", "Get one decision by id.", { id: z.string() }, async ({ id }) =>
    json(decisions.get(requirePaths(), id)),
  );
  server.tool("list_decisions", "List all decisions (summaries).", {}, async () =>
    json(decisions.all(requirePaths()).map(({ body, ...rest }) => rest)),
  );

  // ---- traceability ----
  server.tool(
    "tag_code",
    "Anchor a code symbol to a decision; pass the symbol's source body so the SHA is exact.",
    {
      decisionId: z.string(),
      file: z.string(),
      symbol: z.string(),
      body: z.string(),
      author: z.string(),
    },
    async (a) => json(await traceability.tagCode(a)),
  );
  server.tool(
    "why",
    "Find why a symbol exists, by file+symbol or by SHA-256 of its body.",
    { file: z.string().optional(), symbol: z.string().optional(), hash: z.string().optional() },
    async ({ file, symbol, hash }) => {
      if (hash) return json(traceability.whyForHash(hash));
      if (file && symbol) return json(traceability.whyFor(file, symbol));
      return json({ error: "provide file+symbol or hash" });
    },
  );

  // ---- memory ----
  server.tool("read_memory", "Read a memory scope (default: shared).", { scope: z.string().optional() }, async ({ scope }) =>
    json({ scope: scope ?? "shared", text: memory.read((scope ?? "shared") as memory.MemoryScope) }),
  );
  server.tool(
    "write_memory",
    "Replace a memory scope's contents (English).",
    { scope: z.string().optional(), content: z.string() },
    async ({ scope, content }) => {
      await memory.write((scope ?? "shared") as memory.MemoryScope, content);
      return json({ ok: true });
    },
  );
  server.tool(
    "append_memory",
    "Append an attributed note to a memory scope (English).",
    { scope: z.string().optional(), author: z.string(), entry: z.string() },
    async ({ scope, author, entry }) => {
      await memory.append((scope ?? "shared") as memory.MemoryScope, author, entry);
      return json({ ok: true });
    },
  );

  // ---- knowledge ----
  server.tool(
    "record_learning",
    "Record a reusable learning (English).",
    {
      summary: z.string(),
      body: z.string(),
      author: z.string(),
      source: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
    },
    async (a) => json(await knowledge.record(a)),
  );
  server.tool("get_learnings", "List accumulated learnings.", {}, async () =>
    json(knowledge.list(requirePaths())),
  );
  server.tool("distill", "Distill recurring patterns from decisions into a learning.", { author: z.string().optional() }, async ({ author }) =>
    json(await knowledge.distill(author)),
  );

  // ---- adopt (brownfield onboarding) ----
  server.tool(
    "adopt_report",
    "Inventory an existing project (languages, manifests, largest files, tag coverage) and return an onboarding plan. Read-only.",
    {},
    async () => json(analyze(requirePaths().root)),
  );
  server.tool(
    "start_adoption",
    "Begin adopting an existing codebase: persist a baseline decision, an adoption task and a shared-memory brief. Call once per project.",
    { author: z.string().optional() },
    async ({ author }) => json(await adopt(author ?? "agent:unknown")),
  );

  // ---- verify ----
  server.tool("verify", "Run traceability checks and return the report.", {}, async () => json(verify()));

  return server;
}

/** Entry point used by `rational-agnostic mcp`. @why: D-0024 */
export async function main(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Allow `node dist/mcp/server.js` to run the server directly (cross-platform).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
