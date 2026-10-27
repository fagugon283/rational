// Resolution of the .rational-agnostic data directory and its sub-paths.
// @why: D-0002
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Name of the data directory rational-agnostic manages inside a repo. */
export const DATA_DIR = ".rational-agnostic";

/** Known sub-paths inside the data directory. */
export interface RaPaths {
  root: string; // repo root (parent of DATA_DIR)
  data: string; // .rational-agnostic
  config: string; // config.json
  decisions: string; // decisions/
  tasks: string; // tasks/
  board: string; // tasks/board.json
  memory: string; // memory/
  memoryShared: string; // memory/shared.md
  memoryAgents: string; // memory/agents/
  knowledge: string; // knowledge/
  learnings: string; // knowledge/learnings.md
  conventions: string; // knowledge/conventions.md
  index: string; // index/
  registry: string; // index/registry.json
  embeddings: string; // index/embeddings/
  locks: string; // index/locks/
}

/** Build the set of paths given a repo root. */
export function pathsFor(root: string): RaPaths {
  const data = join(root, DATA_DIR);
  return {
    root,
    data,
    config: join(data, "config.json"),
    decisions: join(data, "decisions"),
    tasks: join(data, "tasks"),
    board: join(data, "tasks", "board.json"),
    memory: join(data, "memory"),
    memoryShared: join(data, "memory", "shared.md"),
    memoryAgents: join(data, "memory", "agents"),
    knowledge: join(data, "knowledge"),
    learnings: join(data, "knowledge", "learnings.md"),
    conventions: join(data, "knowledge", "conventions.md"),
    index: join(data, "index"),
    registry: join(data, "index", "registry.json"),
    embeddings: join(data, "index", "embeddings"),
    locks: join(data, "index", "locks"),
  };
}

/**
 * Walk up from `start` looking for an existing DATA_DIR. Returns the repo root
 * (parent of DATA_DIR) or null when not initialized.
 * @why: D-0002
 */
export function findRoot(start: string = process.cwd()): string | null {
  let dir = resolve(start);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (existsSync(join(dir, DATA_DIR))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Resolve paths for the nearest initialized repo, or throw a helpful error. */
export function requirePaths(start: string = process.cwd()): RaPaths {
  const root = findRoot(start);
  if (!root) {
    throw new Error(
      `rational-agnostic is not initialized here. Run "rational-agnostic init" first.`,
    );
  }
  return pathsFor(root);
}
