// Cross-process file locking so agents from different vendors can write the
// shared stores concurrently without corrupting them.
// @why: D-0008
import { closeSync, openSync } from "node:fs";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import { ensureDir } from "./fsutil.js";
import type { RaPaths } from "./paths.js";

/** Touch a sentinel file to lock (proper-lockfile needs an existing target). */
function sentinel(paths: RaPaths, name: string): string {
  ensureDir(paths.locks);
  const file = join(paths.locks, `${name}.lock`);
  try {
    closeSync(openSync(file, "a")); // create if missing, leave contents alone
  } catch {
    /* ignore */
  }
  return file;
}

/**
 * Run `fn` while holding a named lock. Retries with backoff for a few seconds
 * so parallel agents queue instead of failing.
 * @why: D-0008
 */
export async function withLock<T>(
  paths: RaPaths,
  name: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const target = sentinel(paths, name);
  const release = await lockfile.lock(target, {
    stale: 15_000,
    retries: { retries: 50, factor: 1.4, minTimeout: 40, maxTimeout: 1_000 },
  });
  try {
    return await fn();
  } finally {
    await release();
  }
}
