// `adopt`: deterministic onboarding for an existing (brownfield) project. It
// inventories the codebase and produces a plan + prompt for a user-chosen AI
// agent to explore and backfill decisions. It never fabricates rationale.
// @why: D-0026
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { DATA_DIR, requirePaths } from "../core/paths.js";
import { scanTags } from "../core/scan.js";
import * as tasks from "../stores/tasks.js";
import * as memory from "../stores/memory.js";
import * as decisions from "../stores/decisions.js";

const IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".venv",
  "venv",
  "__pycache__",
  "target",
  "vendor",
  DATA_DIR,
]);
const SKIP_EXT = /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|gz|tar|exe|dll|wasm|bin|lock|map|min\.js)$/i;

const LANG: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript",
  ".mjs": "JavaScript", ".cjs": "JavaScript", ".py": "Python", ".go": "Go",
  ".rs": "Rust", ".java": "Java", ".kt": "Kotlin", ".rb": "Ruby", ".php": "PHP",
  ".cs": "C#", ".cpp": "C++", ".cc": "C++", ".c": "C", ".h": "C/C++",
  ".swift": "Swift", ".scala": "Scala", ".sh": "Shell", ".sql": "SQL",
};

const MANIFESTS = [
  "package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml",
  "pom.xml", "build.gradle", "composer.json", "Gemfile", "pubspec.yaml",
];

export interface AdoptReport {
  root: string;
  scannedFiles: number;
  totalBytes: number;
  languages: { language: string; files: number; bytes: number }[];
  manifests: { file: string; name?: string }[];
  entryPoints: string[];
  largestSourceFiles: { file: string; bytes: number }[];
  existingTags: number;
  hadDocs: { agentsMd: boolean; readme: boolean };
  plan: string[];
  onboardingPrompt: string;
}

function walk(dir: string, acc: string[]): void {
  for (const name of readdirSync(dir)) {
    if (IGNORE.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, acc);
    else if (!SKIP_EXT.test(name)) acc.push(full);
  }
}

/** Inventory an existing repo and build an onboarding plan. @why: D-0026 */
export function analyze(root: string): AdoptReport {
  const files: string[] = [];
  walk(root, files);

  const langMap = new Map<string, { files: number; bytes: number }>();
  const sized: { file: string; bytes: number }[] = [];
  let totalBytes = 0;

  for (const f of files) {
    const bytes = statSync(f).size;
    totalBytes += bytes;
    const rel = relative(root, f).replace(/\\/g, "/");
    const lang = LANG[extname(f).toLowerCase()];
    if (lang) {
      const cur = langMap.get(lang) ?? { files: 0, bytes: 0 };
      cur.files++;
      cur.bytes += bytes;
      langMap.set(lang, cur);
      sized.push({ file: rel, bytes });
    }
  }

  const languages = [...langMap.entries()]
    .map(([language, v]) => ({ language, ...v }))
    .sort((a, b) => b.bytes - a.bytes);

  const manifests = MANIFESTS.filter((m) => existsSync(join(root, m))).map((file) => {
    if (file === "package.json") {
      try {
        const pkg = JSON.parse(readFileSync(join(root, file), "utf8"));
        return { file, name: pkg.name };
      } catch {
        /* ignore */
      }
    }
    return { file };
  });

  const entryCandidates = [
    "src/index.ts", "src/index.js", "src/main.ts", "src/main.py", "main.go",
    "src/app.ts", "index.js", "app.py", "cmd", "src/lib.rs",
  ];
  const entryPoints = entryCandidates.filter((e) => existsSync(join(root, e)));

  const largestSourceFiles = sized.sort((a, b) => b.bytes - a.bytes).slice(0, 10);
  const existingTags = scanTags(root).length;

  const hadDocs = {
    agentsMd: existsSync(join(root, "AGENTS.md")),
    readme: existsSync(join(root, "README.md")),
  };

  const topLangs = languages.slice(0, 3).map((l) => l.language).join(", ") || "unknown";
  const plan = [
    "1. Load context: call get_context (empty query) to see what already exists.",
    "2. Read the project manifest(s) and README to understand scope and entry points.",
    `3. Skim the largest source files first (${largestSourceFiles.length} listed) — they carry the most design weight.`,
    "4. For each significant module or non-obvious choice you can infer, call record_decision (Context/Decision/Why/Consequences, English).",
    "5. Tag the functions each decision justifies: add `// @why: D-xxxx` and call tag_code with the symbol body.",
    "6. When you CANNOT infer why something exists, do NOT invent it — add a question to shared memory (append_memory) and ask the user.",
    "7. Record cross-cutting patterns with record_learning; run distill to summarize.",
    "8. Keep the adoption task status current; run verify before finishing.",
  ];

  const onboardingPrompt = [
    `You are onboarding onto an existing ${topLangs} project that just adopted rational-agnostic.`,
    `Read AGENTS.md first, then follow this procedure:`,
    ...plan.map((p) => "  " + p),
    `Work incrementally and commit understanding as decisions. Everything you persist must be in English.`,
    `Start by calling the adopt_report tool (or run \`rational-agnostic adopt\`) to see the full inventory.`,
  ].join("\n");

  return {
    root,
    scannedFiles: files.length,
    totalBytes,
    languages,
    manifests,
    entryPoints,
    largestSourceFiles,
    existingTags,
    hadDocs,
    plan,
    onboardingPrompt,
  };
}

export interface AdoptWriteResult {
  report: AdoptReport;
  taskId: string;
  baselineDecisionId: string;
}

/**
 * Persist the adoption kickoff: a baseline "as-built" decision (honest, not
 * fabricated per-function rationale), an adoption task, and a shared-memory
 * brief so any agent can pick it up. @why: D-0026
 */
export async function adopt(
  author = "human:cli",
  startDir = process.cwd(),
): Promise<AdoptWriteResult> {
  const paths = requirePaths(startDir);
  const report = analyze(paths.root);

  const baseline = await decisions.create(
    {
      title: "Adopt rational-agnostic on an existing codebase",
      summary: "Existing code predates governance; rationale is backfilled incrementally",
      context: `Brownfield adoption: ${report.scannedFiles} files, languages: ${report.languages
        .slice(0, 3)
        .map((l) => l.language)
        .join(", ")}. Pre-existing code has no @why tags.`,
      decision:
        "Treat all pre-existing code as an as-built baseline. New and changed code must carry @why tags; legacy rationale is documented on a best-effort basis as modules are touched.",
      why: "Adopting a large codebase cannot block on documenting every legacy function at once; a baseline lets the team start governing immediately and backfill over time without fabricating rationale.",
      consequences:
        "Legacy functions remain untagged until revisited. verify does not fail on untagged legacy code; it only enforces that any @why tag resolves to a real decision.",
      author,
      tags: ["adoption", "baseline"],
      status: "accepted",
    },
    startDir,
  );

  const task = await tasks.create(
    {
      title: "Explore and document the existing codebase",
      summary: "AI agent backfills decisions and tags for the adopted project",
      goal:
        "Progressively reverse-engineer and record the key decisions behind this codebase, tagging the code each one justifies, starting with the largest/most central modules.",
      status: "doing",
      assignee: author,
      decisions: [baseline.id],
    },
    startDir,
  );

  await memory.append(
    "shared",
    author,
    `Adoption started. Baseline decision ${baseline.id}; task ${task.id}. ` +
      `${report.scannedFiles} files across ${report.languages.length} languages. ` +
      `Agents: run \`rational-agnostic adopt\` (or the adopt_report tool) for the full plan, then backfill decisions + tags. Ask the user when rationale is unknown.`,
    startDir,
  );

  return { report, taskId: task.id, baselineDecisionId: baseline.id };
}
