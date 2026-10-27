// Token-aware context assembler: the piece that "never loses context" while
// keeping token use low. It returns a compact, relevant digest instead of
// dumping the whole history.
// @why: D-0016
import type { RaConfig } from "../core/types.js";
import { requirePaths } from "../core/paths.js";
import * as tasks from "../stores/tasks.js";
import * as decisions from "../stores/decisions.js";
import * as knowledge from "../stores/knowledge.js";
import * as memory from "../stores/memory.js";
import { search, type SearchHit } from "./index.js";

/** Rough token estimate (~4 chars/token) — good enough for budgeting. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface ContextRequest {
  query?: string;
  taskId?: string;
  budgetTokens?: number;
}

export interface ContextResult {
  text: string;
  tokensEstimated: number;
  included: { id: string; kind: string; score?: number }[];
}

/**
 * Assemble a minimal relevant bundle: the active task, the most relevant
 * decisions and learnings (by summary), and a shared-memory tail — all trimmed
 * to a token budget, highest-signal first.
 * @why: D-0016
 */
export async function getContext(
  req: ContextRequest,
  config: RaConfig,
  startDir = process.cwd(),
): Promise<ContextResult> {
  const paths = requirePaths(startDir);
  const budget = req.budgetTokens ?? 1500;
  const included: ContextResult["included"] = [];
  const parts: string[] = [];
  let used = 0;

  const add = (block: string, meta: { id: string; kind: string; score?: number }): boolean => {
    const cost = estimateTokens(block);
    if (used + cost > budget) return false;
    parts.push(block);
    used += cost;
    included.push(meta);
    return true;
  };

  // 1) Active task always comes first — it frames everything else.
  let queryText = req.query ?? "";
  if (req.taskId) {
    const t = tasks.get(paths, req.taskId);
    if (t) {
      queryText = `${queryText} ${t.title} ${t.summary}`.trim();
      add(
        `## Active task ${t.id} — ${t.title}\nStatus: ${t.status}${
          t.assignee ? ` · Assignee: ${t.assignee}` : ""
        }\n${t.summary}`,
        { id: t.id, kind: "task" },
      );
    }
  }

  if (!queryText.trim()) {
    // No signal to rank by: fall back to the most recent decisions/learnings.
    const recentDecisions = decisions.all(paths).slice(-5).reverse();
    for (const d of recentDecisions) {
      if (!add(`- **${d.id}** (${d.status}): ${d.summary}`, { id: d.id, kind: "decision" })) break;
    }
    const text = parts.join("\n\n");
    return { text, tokensEstimated: estimateTokens(text), included };
  }

  // 2) Rank everything else semantically against the query/task.
  const hits: SearchHit[] = await search(
    queryText,
    config,
    { topK: 20 },
    startDir,
  );

  const decisionLines: string[] = [];
  const learningLines: string[] = [];
  for (const h of hits) {
    if (h.kind === "decision") {
      decisionLines.push(`- **${h.id}** (${h.score.toFixed(2)}): ${h.summary}`);
    } else if (h.kind === "learning") {
      learningLines.push(`- **${h.id}** (${h.score.toFixed(2)}): ${h.summary}`);
    }
  }

  if (decisionLines.length) {
    add(`## Relevant decisions\n${decisionLines.join("\n")}`, {
      id: "decisions",
      kind: "section",
    });
  }
  if (learningLines.length) {
    add(`## Relevant learnings\n${learningLines.join("\n")}`, {
      id: "learnings",
      kind: "section",
    });
  }

  // 3) A short tail of shared memory for cross-agent continuity.
  const shared = memory.read("shared", paths.root).trim();
  if (shared) {
    const tail = shared.split("\n").slice(-12).join("\n");
    add(`## Shared memory (recent)\n${tail}`, { id: "memory:shared", kind: "memory" });
  }

  const text = parts.join("\n\n");
  return { text, tokensEstimated: estimateTokens(text), included };
}
