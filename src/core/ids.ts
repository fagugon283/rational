// Identifier generation and validation for decisions, tasks and learnings.
// @why: D-0005
import { randomBytes } from "node:crypto";

// Accept 4+ hex chars: the generator emits 6 (collision-safe for parallel
// agents), but shorter curated ids like D-0001 are valid too.
export const DECISION_RE = /^D-[0-9a-f]{4,}$/;
export const TASK_RE = /^T-\d{4,}$/;
export const LEARNING_RE = /^L-\d{4,}$/;

/**
 * Decision ids are short random hex (D-7f3a2c): stable, collision-checked
 * against existing ids, and convenient to drop into a `// @why:` code comment.
 * @why: D-0005
 */
export function newDecisionId(existing: Set<string>): string {
  for (let i = 0; i < 1000; i++) {
    const id = `D-${randomBytes(3).toString("hex")}`;
    if (!existing.has(id)) return id;
  }
  throw new Error("Could not allocate a unique decision id");
}

/** Sequential, zero-padded ids for tasks (T-0001) and learnings (L-0001). */
export function nextSeqId(prefix: "T" | "L", existing: Set<string>): string {
  let max = 0;
  for (const id of existing) {
    const m = id.match(/-(\d+)$/);
    if (m && id.startsWith(prefix + "-")) {
      max = Math.max(max, Number(m[1]));
    }
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}
