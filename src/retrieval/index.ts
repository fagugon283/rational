// Vector index over decisions, tasks, learnings and shared memory. The index is
// a rebuildable cache (gitignored); the markdown files remain the source of truth.
// @why: D-0015
import { join } from "node:path";
import type { RaConfig } from "../core/types.js";
import { readJson, writeJson } from "../core/fsutil.js";
import { withLock } from "../core/lock.js";
import { requirePaths, type RaPaths } from "../core/paths.js";
import * as decisions from "../stores/decisions.js";
import * as tasks from "../stores/tasks.js";
import * as knowledge from "../stores/knowledge.js";
import * as memory from "../stores/memory.js";
import { getEmbedder } from "./embeddings.js";

export type DocKind = "decision" | "task" | "learning" | "memory";

export interface IndexedDoc {
  id: string;
  kind: DocKind;
  title: string;
  summary: string;
  vector: number[];
}
interface VectorStore {
  version: 1;
  embedder: string;
  dims: number;
  builtAt: string;
  docs: IndexedDoc[];
}

interface RawDoc {
  id: string;
  kind: DocKind;
  title: string;
  summary: string;
  text: string;
}

function storeFile(paths: RaPaths): string {
  return join(paths.embeddings, "vectors.json");
}

/** Collect every indexable document from the stores. */
function gather(paths: RaPaths): RawDoc[] {
  const docs: RawDoc[] = [];
  for (const d of decisions.all(paths)) {
    docs.push({
      id: d.id,
      kind: "decision",
      title: d.title,
      summary: d.summary,
      text: `${d.title}\n${d.summary}\n${d.body}\n${d.tags.join(" ")}`,
    });
  }
  for (const t of tasks.all(paths)) {
    docs.push({
      id: t.id,
      kind: "task",
      title: t.title,
      summary: t.summary,
      text: `${t.title}\n${t.summary}\n${t.body}`,
    });
  }
  for (const l of knowledge.list(paths)) {
    docs.push({
      id: l.id,
      kind: "learning",
      title: l.summary,
      summary: l.summary,
      text: `${l.summary}\n${l.body}\n${l.tags.join(" ")}`,
    });
  }
  const shared = memory.read("shared", paths.root).trim();
  if (shared) {
    docs.push({
      id: "memory:shared",
      kind: "memory",
      title: "Shared memory",
      summary: shared.slice(0, 160),
      text: shared,
    });
  }
  return docs;
}

/** Cosine similarity for L2-normalized or arbitrary vectors. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dot / denom;
}

/** Rebuild the whole vector index from the current store contents. @why: D-0015 */
export async function rebuild(
  config: RaConfig,
  startDir = process.cwd(),
): Promise<number> {
  const paths = requirePaths(startDir);
  const embedder = await getEmbedder(config.embeddings);
  const raw = gather(paths);
  const vectors = raw.length
    ? await embedder.embed(raw.map((d) => d.text))
    : [];
  const store: VectorStore = {
    version: 1,
    embedder: embedder.id,
    dims: embedder.dimensions,
    builtAt: new Date().toISOString(),
    docs: raw.map((d, i) => ({
      id: d.id,
      kind: d.kind,
      title: d.title,
      summary: d.summary,
      vector: vectors[i] ?? [],
    })),
  };
  await withLock(paths, "index", () => writeJson(storeFile(paths), store));
  return store.docs.length;
}

function load(paths: RaPaths): VectorStore | null {
  const s = readJson<VectorStore | null>(storeFile(paths), null);
  return s && Array.isArray(s.docs) ? s : null;
}

export interface SearchHit {
  id: string;
  kind: DocKind;
  title: string;
  summary: string;
  score: number;
}

/**
 * Semantic search. Rebuilds the index automatically when missing or when the
 * configured embedder no longer matches the stored one.
 */
export async function search(
  query: string,
  config: RaConfig,
  opts: { topK?: number; kinds?: DocKind[] } = {},
  startDir = process.cwd(),
): Promise<SearchHit[]> {
  const paths = requirePaths(startDir);
  const embedder = await getEmbedder(config.embeddings);
  let store = load(paths);
  if (!store || store.embedder !== embedder.id) {
    await rebuild(config, startDir);
    store = load(paths);
  }
  if (!store || store.docs.length === 0) return [];
  const [q] = await embedder.embed([query]);
  const hits = store.docs
    .filter((d) => !opts.kinds || opts.kinds.includes(d.kind))
    .map((d) => ({
      id: d.id,
      kind: d.kind,
      title: d.title,
      summary: d.summary,
      score: cosine(q!, d.vector),
    }))
    .sort((a, b) => b.score - a.score);
  return hits.slice(0, opts.topK ?? 8);
}
