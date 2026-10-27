// Public library surface for rational-agnostic.
// @why: D-0022
export * as decisions from "./stores/decisions.js";
export * as tasks from "./stores/tasks.js";
export * as memory from "./stores/memory.js";
export * as knowledge from "./stores/knowledge.js";
export * as traceability from "./stores/traceability.js";
export * as retrieval from "./retrieval/index.js";
export { getContext } from "./retrieval/context.js";
export * as adopt from "./adopt/adopt.js";
export { init } from "./init/init.js";
export { verify } from "./core/verify.js";
export { scanTags } from "./core/scan.js";
export { loadConfig, saveConfig, defaultConfig } from "./core/config.js";
export { pathsFor, findRoot, requirePaths } from "./core/paths.js";
export { hashBody, sha256 } from "./core/hash.js";
export * from "./core/types.js";
