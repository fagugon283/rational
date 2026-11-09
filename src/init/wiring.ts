// Auto-wire the host project so every major AI agent can use rational-agnostic
// with zero manual configuration. Each agent discovers MCP servers and reads
// project instructions from a different, client-specific path, so we generate
// the right-named file for each. All writes are non-destructive merges that
// preserve existing user content.
// @why: D-783fc9
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readText, writeFileAtomic, writeJson } from "../core/fsutil.js";

/** The stdio command every client uses to launch the MCP server. */
const MCP_COMMAND = "npx";
const MCP_ARGS = ["-y", "rational-agnostic", "mcp"];
const SERVER_KEY = "rational-agnostic";

export interface WireResult {
  created: string[];
  skipped: string[];
}

/**
 * Generate/merge per-agent MCP configs and instruction pointers so Claude Code,
 * Cursor, Codex, Gemini CLI and Copilot are all wired after a single `init`.
 * Never clobbers existing servers or instruction files. @why: D-783fc9
 */
export function wireAgents(root: string): WireResult {
  const created: string[] = [];
  const skipped: string[] = [];

  // --- MCP server registrations (JSON clients) ---
  // Claude Code auto-discovers .mcp.json; Cursor and Gemini use the same
  // `mcpServers` schema; VS Code / Copilot use a `servers` container with type.
  mergeJsonServer(root, ".mcp.json", "mcpServers", stdioEntry(), created, skipped);
  mergeJsonServer(root, join(".cursor", "mcp.json"), "mcpServers", stdioEntry(), created, skipped);
  mergeJsonServer(root, join(".gemini", "settings.json"), "mcpServers", stdioEntry(), created, skipped);
  mergeJsonServer(
    root,
    join(".vscode", "mcp.json"),
    "servers",
    { ...stdioEntry(), type: "stdio" },
    created,
    skipped,
  );

  // --- MCP server registration (Codex, TOML) ---
  mergeCodexToml(root, created, skipped);

  // --- Instruction pointers for agents that do NOT read AGENTS.md ---
  // Claude Code reads CLAUDE.md, Gemini CLI reads GEMINI.md, Copilot reads
  // .github/copilot-instructions.md. Each just points at AGENTS.md.
  writePointer(root, "CLAUDE.md", created, skipped);
  writePointer(root, "GEMINI.md", created, skipped);
  writePointer(root, join(".github", "copilot-instructions.md"), created, skipped);

  return { created, skipped };
}

/** The canonical stdio server entry shared by the JSON clients. @why: D-783fc9 */
function stdioEntry(): { command: string; args: string[] } {
  return { command: MCP_COMMAND, args: [...MCP_ARGS] };
}

/**
 * Add our server under `containerKey` in a JSON config, preserving every other
 * server and top-level key. Leaves malformed JSON untouched. @why: D-783fc9
 */
function mergeJsonServer(
  root: string,
  relPath: string,
  containerKey: string,
  entry: Record<string, unknown>,
  created: string[],
  skipped: string[],
): void {
  const file = join(root, relPath);
  const label = relPath.split("\\").join("/");
  let data: Record<string, unknown> = {};

  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readText(file, "{}"));
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        skipped.push(`${label} (not an object, left untouched)`);
        return;
      }
      data = parsed as Record<string, unknown>;
    } catch {
      skipped.push(`${label} (invalid JSON, left untouched)`);
      return;
    }
  }

  const container =
    data[containerKey] && typeof data[containerKey] === "object" && !Array.isArray(data[containerKey])
      ? (data[containerKey] as Record<string, unknown>)
      : {};

  if (JSON.stringify(container[SERVER_KEY]) === JSON.stringify(entry)) {
    skipped.push(`${label} (already up to date)`);
    return;
  }

  const existed = SERVER_KEY in container;
  container[SERVER_KEY] = entry;
  data[containerKey] = container;
  writeJson(file, data);
  created.push(existed ? `${label} (updated)` : label);
}

/**
 * Append a `[mcp_servers.rational-agnostic]` table to Codex's project config,
 * creating the file if needed. Skips if the table is already present so we never
 * duplicate it. @why: D-783fc9
 */
function mergeCodexToml(root: string, created: string[], skipped: string[]): void {
  const file = join(root, ".codex", "config.toml");
  const label = ".codex/config.toml";
  const block =
    `[mcp_servers.${SERVER_KEY}]\n` +
    `command = "${MCP_COMMAND}"\n` +
    `args = [${MCP_ARGS.map((a) => `"${a}"`).join(", ")}]\n`;

  if (!existsSync(file)) {
    writeFileAtomic(file, block);
    created.push(label);
    return;
  }

  const current = readText(file, "");
  if (current.includes(`[mcp_servers.${SERVER_KEY}]`)) {
    skipped.push(`${label} (already present)`);
    return;
  }
  const sep = current.length === 0 || current.endsWith("\n") ? "\n" : "\n\n";
  writeFileAtomic(file, current + sep + block);
  created.push(`${label} (merged)`);
}

const POINTER_BODY =
  "This project is governed by **rational-agnostic**. Read and follow " +
  "[`AGENTS.md`](./AGENTS.md) — it defines the decisions / tasks / shared-memory " +
  "protocol every AI agent in this repo must follow. Persist everything in English.\n";

/**
 * Drop a short instruction file that points at AGENTS.md, for agents that read a
 * different filename. If the file exists and already mentions AGENTS.md, leave
 * it; otherwise append a one-line pointer without destroying its content.
 * @why: D-783fc9
 */
function writePointer(root: string, relPath: string, created: string[], skipped: string[]): void {
  const file = join(root, relPath);
  const label = relPath.split("\\").join("/");

  if (!existsSync(file)) {
    const heading = `# ${label.split("/").pop()}\n\n`;
    writeFileAtomic(file, heading + POINTER_BODY);
    created.push(label);
    return;
  }

  const current = readText(file, "");
  if (current.includes("AGENTS.md")) {
    skipped.push(`${label} (already references AGENTS.md)`);
    return;
  }
  const sep = current.endsWith("\n") ? "\n" : "\n\n";
  writeFileAtomic(
    file,
    current + sep + "> This project uses rational-agnostic — read and follow [`AGENTS.md`](./AGENTS.md).\n",
  );
  created.push(`${label} (merged)`);
}
