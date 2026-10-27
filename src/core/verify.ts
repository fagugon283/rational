// Verification used by the pre-commit hook / CI: it gives the governance layer
// its "teeth" without blocking exploratory work harder than configured.
// @why: D-0018
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { requirePaths } from "./paths.js";
import { scanTags } from "./scan.js";
import { loadRegistry } from "./registry.js";
import * as decisions from "../stores/decisions.js";
import * as tasks from "../stores/tasks.js";

export interface Issue {
  level: "error" | "warning";
  code: string;
  message: string;
}

export interface VerifyReport {
  ok: boolean;
  errors: number;
  warnings: number;
  issues: Issue[];
}

/** Run all configured checks and summarize. @why: D-0018 */
export function verify(startDir = process.cwd()): VerifyReport {
  const paths = requirePaths(startDir);
  const config = loadConfig(paths);
  const issues: Issue[] = [];
  const decisionIds = new Set(decisions.listIds(paths));

  // 1) Every @why tag must point to an existing decision (no orphans).
  const tags = scanTags(paths.root);
  for (const t of tags) {
    if (!decisionIds.has(t.decisionId)) {
      issues.push({
        level: config.rules.failOnOrphans ? "error" : "warning",
        code: "orphan-tag",
        message: `${t.file}:${t.line} references missing decision ${t.decisionId} (symbol ${t.symbol})`,
      });
    }
  }

  // 2) Registry anchors whose source file has disappeared.
  const reg = loadRegistry(paths);
  for (const [decisionId, anchors] of Object.entries(reg.anchors)) {
    for (const a of anchors) {
      if (!existsSync(join(paths.root, a.file))) {
        issues.push({
          level: "warning",
          code: "stale-anchor",
          message: `Decision ${decisionId} is anchored to missing file ${a.file} (symbol ${a.symbol})`,
        });
      }
    }
  }

  // 3) Tasks must carry a valid status.
  if (config.rules.requireTaskStatus) {
    for (const t of tasks.all(paths)) {
      if (!tasks.isStatus(t.status)) {
        issues.push({
          level: "error",
          code: "bad-task-status",
          message: `Task ${t.id} has invalid status "${t.status}"`,
        });
      }
    }
  }

  // 4) Decisions should document a non-empty "Why".
  for (const d of decisions.all(paths)) {
    const why = /##\s*Why\s*\n([\s\S]*?)(\n##\s|$)/.exec(d.body);
    if (!why || !why[1]!.trim()) {
      issues.push({
        level: "warning",
        code: "empty-why",
        message: `Decision ${d.id} has an empty "Why" section`,
      });
    }
  }

  const errors = issues.filter((i) => i.level === "error").length;
  const warnings = issues.filter((i) => i.level === "warning").length;
  return { ok: errors === 0, errors, warnings, issues };
}
