// Anchoring code to decisions and looking it back up — including by SHA, so you
// can "hash a function and find why it was written".
// @why: D-0019
import type { CodeAnchor, Decision } from "../core/types.js";
import { hashBody } from "../core/hash.js";
import { addAnchor, findByAnchor, loadRegistry } from "../core/registry.js";
import { requirePaths } from "../core/paths.js";
import * as decisions from "./decisions.js";

export interface TagResult {
  decisionId: string;
  anchor: CodeAnchor;
}

/**
 * Anchor a symbol to a decision. The caller passes the symbol's source body so
 * the hash is exact and language-independent.
 * @why: D-0019
 */
export async function tagCode(
  params: {
    decisionId: string;
    file: string;
    symbol: string;
    body: string;
    author: string;
  },
  startDir = process.cwd(),
): Promise<TagResult> {
  const paths = requirePaths(startDir);
  if (!decisions.get(paths, params.decisionId)) {
    throw new Error(`Decision ${params.decisionId} does not exist`);
  }
  const anchor: CodeAnchor = {
    file: params.file.replace(/\\/g, "/"),
    symbol: params.symbol,
    sha256: hashBody(params.body),
    taggedAt: new Date().toISOString(),
    taggedBy: params.author,
  };
  await addAnchor(paths, params.decisionId, anchor);
  return { decisionId: params.decisionId, anchor };
}

/** Look up the decision behind a file+symbol anchor. */
export function whyFor(
  file: string,
  symbol: string,
  startDir = process.cwd(),
): { decision: Decision; anchor: CodeAnchor } | null {
  const paths = requirePaths(startDir);
  const hit = findByAnchor(paths, file.replace(/\\/g, "/"), symbol);
  if (!hit) return null;
  const decision = decisions.get(paths, hit.decisionId);
  if (!decision) return null;
  return { decision, anchor: hit.anchor };
}

/**
 * Look up the decision behind a SHA-256 of a (normalized) function body.
 * @why: D-0019
 */
export function whyForHash(
  sha256: string,
  startDir = process.cwd(),
): { decisionId: string; anchor: CodeAnchor; decision: Decision | null }[] {
  const paths = requirePaths(startDir);
  const reg = loadRegistry(paths);
  const out: { decisionId: string; anchor: CodeAnchor; decision: Decision | null }[] = [];
  for (const [decisionId, anchors] of Object.entries(reg.anchors)) {
    for (const a of anchors) {
      if (a.sha256 === sha256) {
        out.push({ decisionId, anchor: a, decision: decisions.get(paths, decisionId) });
      }
    }
  }
  return out;
}

/** Hash an arbitrary body with the same normalization used by the registry. */
export function hashOf(body: string): string {
  return hashBody(body);
}
