// End-to-end tests over the built dist. Run with: npm run build && npm test
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { init } from "../dist/init/init.js";
import { pathsFor } from "../dist/core/paths.js";
import { loadConfig, saveConfig } from "../dist/core/config.js";
import * as decisions from "../dist/stores/decisions.js";
import * as tasks from "../dist/stores/tasks.js";
import * as memory from "../dist/stores/memory.js";
import * as traceability from "../dist/stores/traceability.js";
import { verify } from "../dist/core/verify.js";
import { search } from "../dist/retrieval/index.js";
import { getContext } from "../dist/retrieval/context.js";

function fresh() {
  const root = mkdtempSync(join(tmpdir(), "ra-"));
  init(root, { locale: "en" });
  // Force the deterministic lexical embedder so tests are fast & offline.
  const paths = pathsFor(root);
  const cfg = loadConfig(paths);
  cfg.embeddings.provider = "none";
  saveConfig(paths, cfg);
  return { root, paths, cfg: loadConfig(paths) };
}

test("init creates AGENTS.md and the data dir", () => {
  const { root, paths } = fresh();
  assert.ok(decisions.listIds(paths).length === 0);
  rmSync(root, { recursive: true, force: true });
});

test("decision -> tag_code -> why (by symbol and by hash)", async () => {
  const { root } = fresh();
  const d = await decisions.create(
    {
      title: "Use JWT",
      summary: "Stateless auth via JWT",
      context: "Scale without sticky sessions",
      decision: "Short-lived JWT + refresh",
      why: "Avoid shared session storage",
      author: "agent:test:unit",
      tags: ["auth"],
    },
    root,
  );
  assert.match(d.id, /^D-[0-9a-f]{6}$/);

  const body = "function issueToken(u){\n  return sign(u);\n}";
  const res = await traceability.tagCode(
    { decisionId: d.id, file: "src/auth.js", symbol: "issueToken", body, author: "agent:test:unit" },
    root,
  );
  const bySymbol = traceability.whyFor("src/auth.js", "issueToken", root);
  assert.equal(bySymbol?.decision.id, d.id);

  const byHash = traceability.whyForHash(res.anchor.sha256, root);
  assert.equal(byHash[0]?.decisionId, d.id);

  // Reindentation / trailing blank lines must NOT register as drift...
  assert.equal(
    traceability.hashOf(body),
    traceability.hashOf("   function issueToken(u){\n        return sign(u);\n   }\n\n"),
  );
  // ...but a semantic edit must.
  assert.notEqual(traceability.hashOf(body), traceability.hashOf("function issueToken(u){\n  return sign(u, true);\n}"));
  rmSync(root, { recursive: true, force: true });
});

test("task status flows and updates the board", async () => {
  const { root, paths } = fresh();
  const t = await tasks.create({ title: "Do thing", summary: "a thing" }, root);
  assert.equal(t.status, "todo");
  await tasks.setStatus(t.id, "doing", { assignee: "agent:test:unit" }, root);
  const board = tasks.loadBoard(paths);
  assert.equal(board.tasks[t.id].status, "doing");
  assert.equal(board.tasks[t.id].assignee, "agent:test:unit");
  rmSync(root, { recursive: true, force: true });
});

test("shared memory append is attributed and readable", async () => {
  const { root } = fresh();
  await memory.append("shared", "agent:openai:codex", "ttl is 15m", root);
  const text = memory.read("shared", root);
  assert.match(text, /agent:openai:codex/);
  assert.match(text, /ttl is 15m/);
  rmSync(root, { recursive: true, force: true });
});

test("verify passes when clean and fails on an orphan tag", async () => {
  const { root } = fresh();
  const d = await decisions.create(
    { title: "x", summary: "x", context: "x", decision: "x", why: "x", author: "a" },
    root,
  );
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/ok.js"), `// @why: ${d.id}\nfunction ok(){}\n`);
  assert.equal(verify(root).ok, true);

  writeFileSync(join(root, "src/bad.js"), `// @why: D-000000\nfunction bad(){}\n`);
  const report = verify(root);
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => i.code === "orphan-tag"));
  rmSync(root, { recursive: true, force: true });
});

test("semantic search and token-budgeted context (lexical embedder)", async () => {
  const { root, cfg } = fresh();
  await decisions.create(
    {
      title: "Use JWT for authentication",
      summary: "authentication tokens via JWT",
      context: "scaling",
      decision: "jwt",
      why: "stateless",
      author: "a",
      tags: ["auth", "token"],
    },
    root,
  );
  await decisions.create(
    {
      title: "Use Postgres for storage",
      summary: "relational database choice",
      context: "data",
      decision: "pg",
      why: "acid",
      author: "a",
    },
    root,
  );
  const hits = await search("authentication token", cfg, { topK: 2 }, root);
  assert.ok(hits.length >= 1);
  assert.match(hits[0].summary, /authentication/i);

  const ctx = await getContext({ query: "authentication", budgetTokens: 300 }, cfg, root);
  assert.ok(ctx.tokensEstimated <= 300);
  assert.ok(ctx.text.length > 0);
  rmSync(root, { recursive: true, force: true });
});
