// `init`: scaffold AGENTS.md and the .rational-agnostic data directory.
// @why: D-0021
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, readText, writeFileAtomic, writeJson } from "../core/fsutil.js";
import { defaultConfig } from "../core/config.js";
import { pathsFor } from "../core/paths.js";
import {
  AGENTS_MD,
  CONVENTIONS_MD,
  LEARNINGS_MD,
  PRE_COMMIT_HOOK,
  SHARED_MEMORY_MD,
} from "./templates.js";

export interface InitOptions {
  locale?: string;
  force?: boolean;
  withHook?: boolean;
}

export interface InitResult {
  root: string;
  created: string[];
  skipped: string[];
}

/** Create the full data directory and AGENTS.md. Idempotent unless `force`. @why: D-0021 */
export function init(root: string, opts: InitOptions = {}): InitResult {
  const paths = pathsFor(root);
  const created: string[] = [];
  const skipped: string[] = [];

  for (const dir of [
    paths.data,
    paths.decisions,
    paths.tasks,
    paths.memory,
    paths.memoryAgents,
    paths.knowledge,
    paths.index,
    paths.embeddings,
    paths.locks,
  ]) {
    ensureDir(dir);
  }

  const writeOnce = (file: string, content: string, label: string) => {
    if (existsSync(file) && !opts.force) {
      skipped.push(label);
      return;
    }
    writeFileAtomic(file, content);
    created.push(label);
  };

  // config.json
  if (existsSync(paths.config) && !opts.force) {
    skipped.push("config.json");
  } else {
    writeJson(paths.config, defaultConfig(opts.locale ?? "en"));
    created.push("config.json");
  }

  writeOnce(join(root, "AGENTS.md"), AGENTS_MD, "AGENTS.md");
  writeOnce(paths.memoryShared, SHARED_MEMORY_MD, "memory/shared.md");
  writeOnce(paths.learnings, LEARNINGS_MD, "knowledge/learnings.md");
  writeOnce(paths.conventions, CONVENTIONS_MD, "knowledge/conventions.md");

  if (!existsSync(paths.board)) {
    writeJson(paths.board, { version: 1, tasks: {} });
    created.push("tasks/board.json");
  } else {
    skipped.push("tasks/board.json");
  }

  // Optional git pre-commit hook.
  if (opts.withHook) {
    const hookDir = join(root, ".git", "hooks");
    if (existsSync(join(root, ".git"))) {
      ensureDir(hookDir);
      const hookFile = join(hookDir, "pre-commit");
      if (!existsSync(hookFile) || opts.force) {
        writeFileAtomic(hookFile, PRE_COMMIT_HOOK);
        created.push(".git/hooks/pre-commit");
      } else {
        skipped.push(".git/hooks/pre-commit (exists)");
      }
    } else {
      skipped.push(".git/hooks/pre-commit (no .git)");
    }
  }

  // Keep gitignored dirs present with a .gitkeep so clones have the structure.
  for (const dir of [paths.embeddings, paths.locks]) {
    const keep = join(dir, ".gitkeep");
    if (!existsSync(keep)) writeFileAtomic(keep, "");
  }

  // Ensure the derived caches are gitignored even if the user has no .gitignore.
  ensureGitignore(root);

  return { root, created, skipped };
}

function ensureGitignore(root: string): void {
  const file = join(root, ".gitignore");
  const needed = [
    ".rational-agnostic/index/embeddings/",
    ".rational-agnostic/index/locks/",
  ];
  const current = readText(file, "");
  const missing = needed.filter((line) => !current.includes(line));
  if (missing.length === 0) return;
  const addition =
    (current && !current.endsWith("\n") ? "\n" : "") +
    "\n# rational-agnostic derived caches\n" +
    missing.join("\n") +
    "\n";
  writeFileAtomic(file, current + addition);
}
