#!/usr/bin/env node
// Command-line interface for humans, git hooks and CI. Thin layer over the core.
// @why: D-0023
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { init } from "../init/init.js";
import { requirePaths, findRoot } from "../core/paths.js";
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

const program = new Command();
program
  .name("rational-agnostic")
  .description("File-based governance & traceability layer for AI coding agents")
  .version("0.1.0")
  .option("--json", "output machine-readable JSON", false);

function out(data: unknown, human: () => void): void {
  if (program.opts().json) console.log(JSON.stringify(data, null, 2));
  else human();
}
function csv(v?: string): string[] {
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

program
  .command("init")
  .description("Scaffold AGENTS.md and the .rational-agnostic directory")
  .option("--locale <code>", "user working locale", "en")
  .option("--hook", "install a git pre-commit verify hook", false)
  .option("--force", "overwrite existing files", false)
  .action((o) => {
    const r = init(process.cwd(), { locale: o.locale, withHook: o.hook, force: o.force });
    out(r, () => {
      console.log(`Initialized rational-agnostic in ${r.root}`);
      if (r.created.length) console.log("  created: " + r.created.join(", "));
      if (r.skipped.length) console.log("  skipped: " + r.skipped.join(", "));
    });
  });

program
  .command("mcp")
  .description("Run the MCP server over stdio")
  .action(async () => {
    const { main } = await import("../mcp/server.js");
    await main();
  });

// ---- decisions ----
const dec = program.command("decision").description("Manage decision records");
dec
  .command("add")
  .requiredOption("--title <t>")
  .requiredOption("--summary <s>", "one-line English summary")
  .requiredOption("--context <c>")
  .requiredOption("--decision <d>")
  .requiredOption("--why <w>")
  .option("--consequences <c>", "", "")
  .option("--author <a>", "", "human:cli")
  .option("--task <id>")
  .option("--status <s>", "proposed|accepted|superseded|deprecated", "accepted")
  .option("--tags <list>", "comma-separated")
  .action(async (o) => {
    const d = await decisions.create({
      title: o.title,
      summary: o.summary,
      context: o.context,
      decision: o.decision,
      why: o.why,
      consequences: o.consequences,
      author: o.author,
      task: o.task,
      status: o.status,
      tags: csv(o.tags),
    });
    out(d, () => console.log(`Created ${d.id} — tag code with:  // @why: ${d.id}`));
  });
dec
  .command("list")
  .action(() => {
    const paths = requirePaths();
    const all = decisions.all(paths);
    out(all, () => all.forEach((d) => console.log(`${d.id}  [${d.status}]  ${d.summary}`)));
  });
dec
  .command("show <id>")
  .action((id) => {
    const paths = requirePaths();
    const d = decisions.get(paths, id);
    if (!d) return fail(`Decision ${id} not found`);
    out(d, () => console.log(`# ${d.id} — ${d.title}\n[${d.status}] ${d.date} by ${d.author}\n\n${d.body}`));
  });

// ---- tasks ----
const task = program.command("task").description("Manage tasks");
task
  .command("add")
  .requiredOption("--title <t>")
  .requiredOption("--summary <s>")
  .option("--goal <g>")
  .option("--assignee <a>")
  .option("--status <s>", "backlog|todo|doing|review|blocked|done", "todo")
  .action(async (o) => {
    const t = await tasks.create(o);
    out(t, () => console.log(`Created ${t.id} [${t.status}] — ${t.title}`));
  });
task
  .command("ls")
  .option("--status <s>")
  .action((o) => {
    const paths = requirePaths();
    let all = tasks.all(paths);
    if (o.status) all = all.filter((t) => t.status === o.status);
    out(all, () => all.forEach((t) => console.log(`${t.id}  [${t.status}]  ${t.title}${t.assignee ? "  @" + t.assignee : ""}`)));
  });
task
  .command("set <id> <status>")
  .option("--assignee <a>")
  .option("--note <n>")
  .action(async (id, status, o) => {
    if (!tasks.isStatus(status)) return fail(`Invalid status "${status}"`);
    const t = await tasks.setStatus(id, status, { assignee: o.assignee, note: o.note });
    out(t, () => console.log(`${t.id} -> ${t.status}`));
  });

// ---- memory ----
const mem = program.command("memory").description("Shared / per-agent memory");
mem
  .command("read [scope]")
  .action((scope = "shared") => {
    const text = memory.read(scope as memory.MemoryScope);
    out({ scope, text }, () => console.log(text || "(empty)"));
  });
mem
  .command("append")
  .requiredOption("--author <a>")
  .requiredOption("--text <t>")
  .option("--scope <s>", "shared or agent:<vendor>:<name>", "shared")
  .action(async (o) => {
    await memory.append(o.scope, o.author, o.text);
    out({ ok: true }, () => console.log("appended"));
  });

// ---- knowledge ----
const learn = program.command("learn").description("Learnings / distillation");
learn
  .command("add")
  .requiredOption("--summary <s>")
  .requiredOption("--body <b>")
  .option("--author <a>", "", "human:cli")
  .option("--tags <list>")
  .action(async (o) => {
    const l = await knowledge.record({ summary: o.summary, body: o.body, author: o.author, tags: csv(o.tags) });
    out(l, () => console.log(`Recorded ${l.id}`));
  });
learn
  .command("distill")
  .option("--author <a>", "", "rational-agnostic:distill")
  .action(async (o) => {
    const l = await knowledge.distill(o.author);
    out(l, () => console.log(l ? `Distilled ${l.id}` : "Nothing to distill"));
  });

// ---- traceability ----
program
  .command("tag")
  .description("Anchor a code symbol to a decision")
  .requiredOption("--decision <id>")
  .requiredOption("--file <path>")
  .requiredOption("--symbol <name>")
  .option("--body <src>", "symbol source body")
  .option("--body-file <path>", "read symbol source from a file")
  .option("--author <a>", "", "human:cli")
  .action(async (o) => {
    const body = o.body ?? (o.bodyFile ? readFileSync(o.bodyFile, "utf8") : "");
    const r = await traceability.tagCode({ decisionId: o.decision, file: o.file, symbol: o.symbol, body, author: o.author });
    out(r, () => console.log(`Anchored ${o.symbol} -> ${o.decision} (sha ${r.anchor.sha256.slice(0, 12)}…)`));
  });

program
  .command("why [file] [symbol]")
  .description("Find why a symbol exists (by location or --hash)")
  .option("--hash <sha256>")
  .action((file, symbol, o) => {
    if (o.hash) {
      const hits = traceability.whyForHash(o.hash);
      return out(hits, () =>
        hits.length
          ? hits.forEach((h) => console.log(`${h.anchor.file}:${h.anchor.symbol} -> ${h.decisionId}: ${h.decision?.summary ?? "(missing)"}`))
          : console.log("No anchor matches that hash"));
    }
    if (!file || !symbol) return fail("Provide <file> <symbol> or --hash <sha256>");
    const r = traceability.whyFor(file, symbol);
    out(r, () =>
      r
        ? console.log(`${file}:${symbol} -> ${r.decision.id}\n${r.decision.title}\n\n${r.decision.body}`)
        : console.log("No decision anchored to that symbol"));
  });

program
  .command("hash")
  .description("Hash a function body (stdin or --file) the way the registry does")
  .option("--file <path>")
  .action((o) => {
    const body = o.file ? readFileSync(o.file, "utf8") : readFileSync(0, "utf8");
    const h = traceability.hashOf(body);
    out({ sha256: h }, () => console.log(h));
  });

// ---- retrieval ----
program
  .command("search <query>")
  .option("--k <n>", "top K", "8")
  .action(async (query, o) => {
    const paths = requirePaths();
    const hits = await search(query, loadConfig(paths), { topK: Number(o.k) });
    out(hits, () => hits.forEach((h) => console.log(`${h.score.toFixed(3)}  ${h.id}  [${h.kind}]  ${h.summary}`)));
  });
program
  .command("context")
  .description("Assemble a token-budgeted context bundle")
  .option("--task <id>")
  .option("--query <q>")
  .option("--budget <n>", "token budget", "1500")
  .action(async (o) => {
    const paths = requirePaths();
    const r = await getContext({ taskId: o.task, query: o.query, budgetTokens: Number(o.budget) }, loadConfig(paths));
    out(r, () => console.log(`${r.text}\n\n— ~${r.tokensEstimated} tokens, ${r.included.length} items`));
  });
program
  .command("reindex")
  .description("Rebuild the semantic index from the stores")
  .action(async () => {
    const paths = requirePaths();
    const n = await rebuild(loadConfig(paths));
    out({ indexed: n }, () => console.log(`Reindexed ${n} documents`));
  });

// ---- adopt (brownfield onboarding) ----
program
  .command("adopt")
  .description("Inventory an existing project and produce an onboarding plan for an AI agent")
  .option("--write", "persist a baseline decision, an adoption task and a shared-memory brief", false)
  .option("--author <a>", "", "human:cli")
  .action(async (o) => {
    if (!findRoot()) return fail(`Not initialized. Run "rational-agnostic init" first.`);
    if (o.write) {
      const r = await adopt(o.author);
      return out(r, () => {
        printReport(r.report);
        console.log(`\nPersisted baseline ${r.baselineDecisionId} and task ${r.taskId}.`);
        console.log(`Point your chosen agent at this repo; it should start from the plan above.`);
      });
    }
    const report = analyze(requirePaths().root);
    out(report, () => printReport(report));
  });

function printReport(r: import("../adopt/adopt.js").AdoptReport): void {
  console.log(`Adoption inventory for ${r.root}`);
  console.log(`  files scanned: ${r.scannedFiles}  (~${(r.totalBytes / 1024).toFixed(0)} KB)`);
  console.log(`  languages: ${r.languages.map((l) => `${l.language} (${l.files})`).join(", ") || "none detected"}`);
  if (r.manifests.length) console.log(`  manifests: ${r.manifests.map((m) => m.name ? `${m.file} [${m.name}]` : m.file).join(", ")}`);
  if (r.entryPoints.length) console.log(`  entry points: ${r.entryPoints.join(", ")}`);
  console.log(`  existing @why tags: ${r.existingTags}`);
  if (r.largestSourceFiles.length) {
    console.log(`  document these first:`);
    for (const f of r.largestSourceFiles) console.log(`    - ${f.file} (${(f.bytes / 1024).toFixed(1)} KB)`);
  }
  console.log(`\n--- Onboarding prompt (paste to your chosen agent) ---\n${r.onboardingPrompt}`);
}

// ---- verify ----
program
  .command("verify")
  .description("Check traceability (exit 1 on errors) — for pre-commit / CI")
  .action(() => {
    if (!findRoot()) return fail(`Not initialized. Run "rational-agnostic init".`);
    const report = verify();
    out(report, () => {
      for (const i of report.issues) console.log(`${i.level === "error" ? "✖" : "⚠"} [${i.code}] ${i.message}`);
      console.log(`\n${report.ok ? "OK" : "FAILED"} — ${report.errors} error(s), ${report.warnings} warning(s)`);
    });
    if (!report.ok) process.exitCode = 1;
  });

function fail(msg: string): void {
  if (program.opts().json) console.log(JSON.stringify({ error: msg }));
  else console.error("error: " + msg);
  process.exitCode = 1;
}

program.parseAsync().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
});
