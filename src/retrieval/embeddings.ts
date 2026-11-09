// Pluggable embeddings. Default is a local, offline model (no API key); if the
// optional dependency is absent we degrade to a deterministic lexical embedder
// so semantic-ish search still works everywhere.
// @why: D-0014
import type { EmbeddingsConfig } from "../core/types.js";

// Indirect specifier (typed as string, not a string literal) so the optional
// local-model dependency need not be installed — or even resolvable — at build
// time. The dynamic import still finds it at runtime when the user installs it.
// @why: D-1ac7d8
const OPTIONAL_LOCAL_MODEL_PKG: string = "@huggingface/transformers";

export interface Embedder {
  readonly id: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Deterministic hashing bag-of-words embedder. Zero dependencies, reproducible,
 * good enough for small repos and as a universal fallback.
 * @why: D-0014
 */
class LexicalEmbedder implements Embedder {
  readonly id: string;
  constructor(readonly dimensions = 384) {
    this.id = `lexical-${dimensions}`;
  }
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.vec(t));
  }
  private vec(text: string): number[] {
    const v = new Array<number>(this.dimensions).fill(0);
    const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    for (const tok of tokens) {
      let h = 2166136261;
      for (let i = 0; i < tok.length; i++) {
        h ^= tok.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const idx = Math.abs(h) % this.dimensions;
      v[idx]! += 1;
    }
    // L2 normalize so cosine == dot product.
    let norm = 0;
    for (const x of v) norm += x * x;
    norm = Math.sqrt(norm) || 1;
    return v.map((x) => x / norm);
  }
}

/** Local transformers.js embedder, lazy-loaded so install stays light. */
class LocalModelEmbedder implements Embedder {
  readonly id: string;
  dimensions: number;
  private pipe: unknown;
  constructor(private readonly model: string, dims = 384) {
    this.dimensions = dims;
    this.id = `local:${model}`;
  }
  private async ensure(): Promise<(input: string[], opts: object) => Promise<{ data: Float32Array }>> {
    if (!this.pipe) {
      // Optional dependency; may be absent.
      const mod = (await import(
        /* @vite-ignore */ OPTIONAL_LOCAL_MODEL_PKG
      )) as {
        pipeline: (task: string, model: string, opts?: object) => Promise<unknown>;
      };
      // Pin dtype for determinism and to silence the library's default-dtype warning.
      this.pipe = await mod.pipeline("feature-extraction", this.model, {
        dtype: "fp32",
      });
    }
    return this.pipe as never;
  }
  async embed(texts: string[]): Promise<number[][]> {
    const pipe = await this.ensure();
    const out: number[][] = [];
    for (const t of texts) {
      const res = await pipe([t], { pooling: "mean", normalize: true });
      const arr = Array.from(res.data as Float32Array);
      this.dimensions = arr.length;
      out.push(arr);
    }
    return out;
  }
}

/**
 * Build an embedder from config, falling back to the lexical embedder if the
 * local model's optional dependency cannot be loaded. @huggingface/transformers
 * is an optional peer (not installed by default) so the default footprint stays
 * tiny and free of the sharp/libvips CVEs; this probe enables it when present.
 * @why: D-1ac7d8
 */
export async function getEmbedder(config: EmbeddingsConfig): Promise<Embedder> {
  const dims = config.dimensions ?? 384;
  if (config.provider === "local") {
    try {
      // Probe the optional dependency without instantiating the heavy pipeline.
      await import(/* @vite-ignore */ OPTIONAL_LOCAL_MODEL_PKG);
      return new LocalModelEmbedder(config.model, dims);
    } catch {
      return new LexicalEmbedder(dims);
    }
  }
  // "none" and any unimplemented remote providers use the lexical fallback for now.
  return new LexicalEmbedder(dims);
}
