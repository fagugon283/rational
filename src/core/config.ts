// Load and save config.json with sensible defaults.
// @why: D-0007
import type { RaConfig } from "./types.js";
import { readJson, writeJson } from "./fsutil.js";
import type { RaPaths } from "./paths.js";

/** Default configuration created by `init`. Embeddings default to local & offline. */
export function defaultConfig(locale = "en"): RaConfig {
  return {
    version: 1,
    locale,
    canonical: "en",
    embeddings: {
      provider: "local",
      model: "Xenova/all-MiniLM-L6-v2",
      dimensions: 384,
    },
    rules: {
      requireWhyTag: true,
      requireTaskStatus: true,
      failOnOrphans: true,
    },
  };
}

/** Read config.json, falling back to defaults for any missing field. */
export function loadConfig(paths: RaPaths): RaConfig {
  const base = defaultConfig();
  const stored = readJson<Partial<RaConfig>>(paths.config, {});
  return {
    ...base,
    ...stored,
    embeddings: { ...base.embeddings, ...(stored.embeddings ?? {}) },
    rules: { ...base.rules, ...(stored.rules ?? {}) },
  };
}

/** Persist config.json. */
export function saveConfig(paths: RaPaths, config: RaConfig): void {
  writeJson(paths.config, config);
}
