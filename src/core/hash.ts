// Content hashing used for the @why traceability registry and drift detection.
// @why: D-0004
import { createHash } from "node:crypto";

/** SHA-256 hex digest of a UTF-8 string. */
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Normalize source before hashing so that irrelevant whitespace changes do not
 * register as drift: collapse runs of whitespace, trim line ends, drop blank
 * lines. Semantic edits still change the hash.
 * @why: D-0004
 */
export function normalizeForHash(source: string): string {
  return source
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

/** Stable hash of a function/symbol body (whitespace-insensitive). */
export function hashBody(source: string): string {
  return sha256(normalizeForHash(source));
}
