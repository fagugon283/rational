// Small filesystem helpers: atomic JSON, directory creation, safe reads.
// @why: D-0003
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/** Ensure a directory exists (recursive, idempotent). */
export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

/** Read a UTF-8 text file, or return `fallback` when it does not exist. */
export function readText(file: string, fallback = ""): string {
  if (!existsSync(file)) return fallback;
  return readFileSync(file, "utf8");
}

/**
 * Write a file atomically: write to a temp sibling then rename, so a crash
 * mid-write never leaves a half-written canonical file.
 * @why: D-0003
 */
export function writeFileAtomic(file: string, data: string): void {
  ensureDir(dirname(file));
  const tmp = join(
    dirname(file),
    `.${randomBytes(6).toString("hex")}.tmp`,
  );
  writeFileSync(tmp, data, "utf8");
  renameSync(tmp, file);
}

/** Read and parse a JSON file, or return `fallback` when missing/empty. */
export function readJson<T>(file: string, fallback: T): T {
  const text = readText(file, "");
  if (!text.trim()) return fallback;
  return JSON.parse(text) as T;
}

/** Serialize and atomically write JSON with stable 2-space formatting. */
export function writeJson(file: string, value: unknown): void {
  writeFileAtomic(file, JSON.stringify(value, null, 2) + "\n");
}
