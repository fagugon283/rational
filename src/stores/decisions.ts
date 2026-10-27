// Decision store: one ADR-style markdown file per decision, English only.
// @why: D-0010
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Decision, DecisionStatus } from "../core/types.js";
import { readText, writeFileAtomic } from "../core/fsutil.js";
import { parse, stringify } from "../core/frontmatter.js";
import { newDecisionId, DECISION_RE } from "../core/ids.js";
import { withLock } from "../core/lock.js";
import { requirePaths, type RaPaths } from "../core/paths.js";

interface DecisionFront {
  id: string;
  title: string;
  status: DecisionStatus;
  date: string;
  author: string;
  task?: string;
  supersedes?: string[];
  tags?: string[];
  summary: string;
}

const BODY_TEMPLATE = (d: {
  context: string;
  decision: string;
  why: string;
  consequences: string;
}) =>
  `## Context\n${d.context}\n\n## Decision\n${d.decision}\n\n## Why\n${d.why}\n\n## Consequences\n${d.consequences}`;

function file(paths: RaPaths, id: string): string {
  return join(paths.decisions, `${id}.md`);
}

/** List all decision ids present on disk. */
export function listIds(paths: RaPaths): string[] {
  if (!existsSync(paths.decisions)) return [];
  return readdirSync(paths.decisions)
    .filter((f) => f.endsWith(".md") && DECISION_RE.test(f.replace(/\.md$/, "")))
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
}

/** Read one decision, or null when it does not exist. */
export function get(paths: RaPaths, id: string): Decision | null {
  const p = file(paths, id);
  if (!existsSync(p)) return null;
  const { data, body } = parse<DecisionFront>(readText(p));
  return {
    id: data.id,
    title: data.title,
    status: data.status,
    date: data.date,
    author: data.author,
    task: data.task,
    supersedes: data.supersedes ?? [],
    tags: data.tags ?? [],
    summary: data.summary,
    body,
  };
}

/** Load every decision (used by indexers and `list`). */
export function all(paths: RaPaths): Decision[] {
  return listIds(paths)
    .map((id) => get(paths, id))
    .filter((d): d is Decision => d !== null);
}

export interface NewDecisionInput {
  title: string;
  author: string;
  summary: string;
  context: string;
  decision: string;
  why: string;
  consequences?: string;
  status?: DecisionStatus;
  task?: string;
  supersedes?: string[];
  tags?: string[];
}

/**
 * Create a decision file and return the record (with its freshly allocated id).
 * The id is safe to drop straight into a `// @why:` code comment.
 * @why: D-0010
 */
export async function create(
  input: NewDecisionInput,
  startDir = process.cwd(),
): Promise<Decision> {
  const paths = requirePaths(startDir);
  return withLock(paths, "decisions", () => {
    const id = newDecisionId(new Set(listIds(paths)));
    const rec: Decision = {
      id,
      title: input.title,
      status: input.status ?? "accepted",
      date: new Date().toISOString().slice(0, 10),
      author: input.author,
      task: input.task,
      supersedes: input.supersedes ?? [],
      tags: input.tags ?? [],
      summary: input.summary,
      body: BODY_TEMPLATE({
        context: input.context,
        decision: input.decision,
        why: input.why,
        consequences: input.consequences ?? "",
      }),
    };
    persist(paths, rec);
    return rec;
  });
}

/** Overwrite a decision file from a full record. */
export function persist(paths: RaPaths, d: Decision): void {
  const front: DecisionFront = {
    id: d.id,
    title: d.title,
    status: d.status,
    date: d.date,
    author: d.author,
    ...(d.task ? { task: d.task } : {}),
    supersedes: d.supersedes,
    tags: d.tags,
    summary: d.summary,
  };
  writeFileAtomic(file(paths, d.id), stringify(front, d.body));
}
