// Shared + per-agent memory. Shared memory is the cross-vendor meeting point:
// an OpenAI agent reads what an Anthropic agent left behind.
// @why: D-0012
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, readText, writeFileAtomic } from "../core/fsutil.js";
import { withLock } from "../core/lock.js";
import { requirePaths, type RaPaths } from "../core/paths.js";

export type MemoryScope = "shared" | `agent:${string}`;

function fileFor(paths: RaPaths, scope: MemoryScope): string {
  if (scope === "shared") return paths.memoryShared;
  const agent = scope.slice("agent:".length);
  // Flatten vendor-neutral ids into a filesystem-safe name.
  const safe = agent.replace(/[^a-zA-Z0-9._-]/g, "_");
  return join(paths.memoryAgents, `${safe}.md`);
}

/** Read a memory scope's full markdown (empty string when absent). */
export function read(scope: MemoryScope, startDir = process.cwd()): string {
  const paths = requirePaths(startDir);
  return readText(fileFor(paths, scope), "");
}

/** Replace a memory scope's contents wholesale. @why: D-0012 */
export async function write(
  scope: MemoryScope,
  content: string,
  startDir = process.cwd(),
): Promise<void> {
  const paths = requirePaths(startDir);
  await withLock(paths, `memory-${scope}`, () => {
    const p = fileFor(paths, scope);
    ensureDir(join(p, ".."));
    writeFileAtomic(p, content.trimEnd() + "\n");
  });
}

/** Append an attributed, timestamped entry to a memory scope. */
export async function append(
  scope: MemoryScope,
  author: string,
  entry: string,
  startDir = process.cwd(),
): Promise<void> {
  const paths = requirePaths(startDir);
  await withLock(paths, `memory-${scope}`, () => {
    const p = fileFor(paths, scope);
    ensureDir(join(p, ".."));
    const header = existsSync(p) ? "" : "# Shared memory\n\n";
    const stamp = new Date().toISOString();
    const block = `${header}- **${stamp}** — \`${author}\`: ${entry.trim()}\n`;
    const prev = readText(p, "");
    writeFileAtomic(p, prev + block);
  });
}
