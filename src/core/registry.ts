// The traceability registry: decision id -> code anchors (file+symbol+hash).
// This is what lets you take a function and find WHY it exists.
// @why: D-0009
import type { CodeAnchor, Registry } from "./types.js";
import { readJson, writeJson } from "./fsutil.js";
import { withLock } from "./lock.js";
import type { RaPaths } from "./paths.js";

function empty(): Registry {
  return { version: 1, anchors: {}, updatedAt: new Date().toISOString() };
}

export function loadRegistry(paths: RaPaths): Registry {
  return readJson<Registry>(paths.registry, empty());
}

/** Record that a code symbol is anchored to a decision. Deduplicates by file+symbol. */
export async function addAnchor(
  paths: RaPaths,
  decisionId: string,
  anchor: CodeAnchor,
): Promise<void> {
  await withLock(paths, "registry", () => {
    const reg = loadRegistry(paths);
    const list = reg.anchors[decisionId] ?? [];
    const idx = list.findIndex(
      (a) => a.file === anchor.file && a.symbol === anchor.symbol,
    );
    if (idx >= 0) list[idx] = anchor;
    else list.push(anchor);
    reg.anchors[decisionId] = list;
    reg.updatedAt = new Date().toISOString();
    writeJson(paths.registry, reg);
  });
}

/** Find which decision (if any) a given file+symbol is anchored to. */
export function findByAnchor(
  paths: RaPaths,
  file: string,
  symbol: string,
): { decisionId: string; anchor: CodeAnchor } | null {
  const reg = loadRegistry(paths);
  for (const [decisionId, list] of Object.entries(reg.anchors)) {
    const anchor = list.find((a) => a.file === file && a.symbol === symbol);
    if (anchor) return { decisionId, anchor };
  }
  return null;
}
