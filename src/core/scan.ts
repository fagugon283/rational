// Scan the working tree for `@why: D-xxxx` traceability tags. Language-agnostic:
// it matches the tag inside any comment style and guesses the nearby symbol.
// @why: D-0017
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { DATA_DIR } from "./paths.js";

const WHY_RE = /@why:\s*(D-[0-9a-f]{4,})/;
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  DATA_DIR,
]);
// Binary-ish and documentation extensions we never scan. Markdown is treated as
// docs (where `@why: D-xxxx` appears only as examples), not generated code.
// @why: D-0017
const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|exe|dll|wasm|bin|lock|md|mdx|markdown)$/i;

// Heuristic symbol extractors for common languages.
const SYMBOL_RES = [
  /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/,
  /(?:export\s+)?(?:default\s+)?class\s+([A-Za-z0-9_$]+)/,
  /(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=/,
  /def\s+([A-Za-z0-9_]+)\s*\(/, // python
  /func\s+([A-Za-z0-9_]+)\s*\(/, // go
  /(?:public|private|protected|static|\s)+[\w<>\[\]]+\s+([A-Za-z0-9_]+)\s*\(/, // java/c#
];

export interface Tag {
  file: string; // repo-relative
  line: number; // 1-based
  decisionId: string;
  symbol: string; // best-effort
}

/**
 * Load `.rationalignore` (gitignore-style globs) so files that legitimately
 * contain `@why:` as data or examples (tests, fixtures, this scanner's own
 * patterns) are not flagged. @why: D-0025
 */
function loadIgnore(root: string): RegExp[] {
  const file = join(root, ".rationalignore");
  if (!existsSync(file)) return [];
  const out: RegExp[] = [];
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    out.push(globToRegExp(line));
  }
  return out;
}

/** Minimal gitignore-style glob -> RegExp (supports *, **, trailing /). */
function globToRegExp(glob: string): RegExp {
  let g = glob.replace(/\/$/, "/**"); // a trailing slash matches the whole dir
  g = g
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex specials (not * or /)
    .replace(/\*\*/g, "\u0000") // placeholder for **
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${g}$`);
}

function guessSymbol(lines: string[], fromIdx: number): string {
  for (let i = fromIdx; i < Math.min(fromIdx + 4, lines.length); i++) {
    const line = lines[i]!;
    for (const re of SYMBOL_RES) {
      const m = line.match(re);
      if (m) return m[1]!;
    }
  }
  return "(anonymous)";
}

function walk(dir: string, acc: string[]): void {
  for (const name of readdirSync(dir)) {
    if (IGNORE_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (!SKIP_EXT.test(name) && st.size < 2_000_000) acc.push(full);
  }
}

/** Collect every @why tag in the tree rooted at `root`. @why: D-0017 */
export function scanTags(root: string): Tag[] {
  const files: string[] = [];
  walk(root, files);
  const ignore = loadIgnore(root);
  const tags: Tag[] = [];
  for (const file of files) {
    const rel = relative(root, file).replace(/\\/g, "/");
    if (ignore.some((re) => re.test(rel))) continue;
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!content.includes("@why:")) continue;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i]!.match(WHY_RE);
      if (m) {
        tags.push({
          file: relative(root, file).replace(/\\/g, "/"),
          line: i + 1,
          decisionId: m[1]!,
          symbol: guessSymbol(lines, i),
        });
      }
    }
  }
  return tags;
}
