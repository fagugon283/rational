// Knowledge layer: append-only learnings the system accumulates, plus a
// deterministic `distill` baseline that mines decisions for recurring patterns.
// Agents produce richer learnings explicitly via record_learning.
// @why: D-0013
import type { Learning } from "../core/types.js";
import { readText, writeFileAtomic } from "../core/fsutil.js";
import { nextSeqId } from "../core/ids.js";
import { withLock } from "../core/lock.js";
import { requirePaths, type RaPaths } from "../core/paths.js";
import * as decisions from "./decisions.js";

const HEADING_RE = /^## (L-\d{4,}) — (.*)$/;
const META_RE = /^<!-- meta: (.*) -->$/;

/** Parse the append-only learnings.md into discrete records. */
export function list(paths: RaPaths): Learning[] {
  const raw = readText(paths.learnings, "");
  if (!raw.trim()) return [];
  const out: Learning[] = [];
  let cur: Learning | null = null;
  let bodyLines: string[] = [];
  const flush = () => {
    if (cur) {
      cur.body = bodyLines.join("\n").trim();
      out.push(cur);
    }
  };
  for (const line of raw.split("\n")) {
    const h = line.match(HEADING_RE);
    if (h) {
      flush();
      bodyLines = [];
      cur = {
        id: h[1]!,
        summary: h[2]!,
        date: "",
        author: "",
        source: [],
        tags: [],
        body: "",
      };
      continue;
    }
    const m = line.match(META_RE);
    if (m && cur) {
      try {
        const meta = JSON.parse(m[1]!);
        cur.date = meta.date ?? "";
        cur.author = meta.author ?? "";
        cur.source = meta.source ?? [];
        cur.tags = meta.tags ?? [];
      } catch {
        /* ignore malformed meta */
      }
      continue;
    }
    if (cur) bodyLines.push(line);
  }
  flush();
  return out;
}

export interface NewLearningInput {
  summary: string;
  body: string;
  author: string;
  source?: string[];
  tags?: string[];
}

/** Append a new learning and return it. @why: D-0013 */
export async function record(
  input: NewLearningInput,
  startDir = process.cwd(),
): Promise<Learning> {
  const paths = requirePaths(startDir);
  return withLock(paths, "knowledge", () => {
    const existing = new Set(list(paths).map((l) => l.id));
    const id = nextSeqId("L", existing);
    const learning: Learning = {
      id,
      summary: input.summary,
      body: input.body,
      author: input.author,
      date: new Date().toISOString(),
      source: input.source ?? [],
      tags: input.tags ?? [],
    };
    append(paths, learning);
    return learning;
  });
}

function append(paths: RaPaths, l: Learning): void {
  const prev = readText(paths.learnings, "# Learnings\n");
  const meta = JSON.stringify({
    date: l.date,
    author: l.author,
    source: l.source,
    tags: l.tags,
  });
  const block = `\n## ${l.id} — ${l.summary}\n<!-- meta: ${meta} -->\n\n${l.body.trim()}\n`;
  writeFileAtomic(paths.learnings, prev.trimEnd() + "\n" + block);
}

/**
 * Deterministic baseline distillation: mine decisions for the most common tags
 * and any superseded chains (places we changed our mind), and record a learning
 * summarizing them. Returns null when there is nothing new to say.
 * @why: D-0013
 */
export async function distill(
  author = "rational-agnostic:distill",
  startDir = process.cwd(),
): Promise<Learning | null> {
  const paths = requirePaths(startDir);
  const all = decisions.all(paths);
  if (all.length === 0) return null;

  const tagCounts = new Map<string, number>();
  for (const d of all) {
    for (const t of d.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const superseded = all.filter(
    (d) => d.status === "superseded" || d.supersedes.length > 0,
  );

  const lines: string[] = [];
  lines.push(`Distilled from ${all.length} decision(s).`);
  if (topTags.length) {
    lines.push("");
    lines.push("**Recurring themes (tag → count):**");
    for (const [tag, n] of topTags) lines.push(`- \`${tag}\`: ${n}`);
  }
  if (superseded.length) {
    lines.push("");
    lines.push("**Reversals / revisited decisions:**");
    for (const d of superseded) {
      const chain = d.supersedes.length
        ? ` (supersedes ${d.supersedes.join(", ")})`
        : "";
      lines.push(`- ${d.id}: ${d.summary}${chain}`);
    }
  }

  return record(
    {
      summary: `Automated distillation of ${all.length} decisions`,
      body: lines.join("\n"),
      author,
      source: all.map((d) => d.id),
      tags: topTags.map(([t]) => t),
    },
    startDir,
  );
}
