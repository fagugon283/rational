# rational-agnostic

[![npm version](https://img.shields.io/npm/v/rational-agnostic.svg)](https://www.npmjs.com/package/rational-agnostic)
[![npm downloads](https://img.shields.io/npm/dm/rational-agnostic.svg)](https://www.npmjs.com/package/rational-agnostic)
[![license](https://img.shields.io/npm/l/rational-agnostic.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/rational-agnostic.svg)](https://nodejs.org)

**A vendor-agnostic, file-based governance & traceability layer for AI coding agents.**

`rational-agnostic` sits *above* any agent framework (Claude Code, Codex, Cursor,
Copilot, Jules, …). It is the shared, durable record that agents of **any vendor**
read from and write to:

- 🧠 **Decisions** — every non-trivial choice is recorded as an ADR-style file explaining *why* (in English).
- 🔗 **Traceability** — every generated function carries a `// @why: D-xxxx` tag; you can take a function, hash it, and find the decision behind it.
- 🤝 **Shared memory** — a cross-vendor meeting point so agents don't lose context between sessions or between each other.
- ✅ **Task state** — one file per task + a status board, so everyone knows what's `doing`, `blocked` or `done`.
- 📚 **Learnings** — the system distills recurring patterns from past decisions and code, and keeps improving.
- 🎯 **Token-aware context** — `get_context` returns a *minimal relevant* bundle within a token budget, instead of dumping history.

Everything is persisted in **English**, even when the user works in another language,
so the knowledge base stays portable, searchable and diffable.

> **Design principle:** `AGENTS.md` describes *how the system is structured and used* —
> never what your project is about. Project rationale lives in the decision records.

## Install

```bash
npm install -g rational-agnostic   # or: npx rational-agnostic <command>
```

## Quickstart

Every project starts with `init`, which scaffolds `AGENTS.md`, the
`.rational-agnostic/` store, and wires every major AI agent (see
[Zero-config agent wiring](#zero-config-agent-wiring)):

```bash
cd your-repo
rational-agnostic init            # creates AGENTS.md + .rational-agnostic/
```

### Already have a codebase? Run `adopt` (brownfield)

If the repo already had code **before** rational-agnostic, don't start from a
blank slate — have it inventory what exists and lay out an onboarding plan. This
is the recommended path for any non-empty project:

```bash
rational-agnostic init            # 1. scaffold (adopt needs this first)
rational-agnostic adopt           # 2. read-only inventory + plan:
                                  #    languages, manifests, entry points,
                                  #    largest/most-central files, tag coverage
rational-agnostic adopt --write   # 3. persist an "as-built" baseline decision,
                                  #    open an adoption task, post a brief to
                                  #    shared memory — then point your agent here
```

Nothing breaks on day one: existing untagged code is allowed (`verify` only
flags `@why` tags that point to a *missing* decision, never legacy code). From
there you work the plan **incrementally** — largest/most central modules first —
recording a decision and tagging the code for each design choice you can infer.
**Never invent rationale:** if you can't tell why something exists, ask (append a
question to shared memory) instead of fabricating a decision.

> MCP-capable agents have the same two steps as the `adopt_report` and
> `start_adoption` tools.

### Record a decision and tag the code

Record a decision and tag the code it justifies:

```bash
rational-agnostic decision add \
  --title "Use JWT for auth" \
  --summary "Chose JWT over sessions for stateless scaling" \
  --context "API must scale horizontally without sticky sessions" \
  --decision "Short-lived JWT access tokens + refresh tokens" \
  --why "Stateless tokens avoid shared session storage" \
  --author agent:anthropic:claude-code --tags auth,security
# -> Created D-ea3ec7 — tag code with:  // @why: D-ea3ec7
```

```js
// @why: D-ea3ec7
function issueToken(user) { /* ... */ }
```

Find why a function exists — by location or by hash:

```bash
rational-agnostic why src/auth.js issueToken
printf '%s' "$(cat the-body)" | rational-agnostic hash   # -> sha256
rational-agnostic why --hash <sha256>
```

Gate your commits with traceability:

```bash
rational-agnostic init --hook     # installs a pre-commit `verify` gate
rational-agnostic verify          # exit 1 on orphan tags / bad task status
```

## Zero-config agent wiring

`init` doesn't just scaffold the data store — it **wires every major AI agent for
you**, so whoever runs `npx rational-agnostic init` gets a ready-to-use setup with
no manual MCP configuration. It generates (and safely *merges* into, never
clobbers) the file each client actually reads:

| Agent | MCP config written | Instructions file |
|---|---|---|
| Claude Code | `.mcp.json` (auto-discovered) | `CLAUDE.md` → `AGENTS.md` |
| Cursor | `.cursor/mcp.json` | `AGENTS.md` |
| Codex | `.codex/config.toml` | `AGENTS.md` |
| Gemini CLI | `.gemini/settings.json` | `GEMINI.md` → `AGENTS.md` |
| Copilot | `.vscode/mcp.json` | `.github/copilot-instructions.md` → `AGENTS.md` |

Open any of those agents in the repo and the MCP server + protocol are already in
place (restart the client once to load MCP; approve/trust it if prompted). Opt out
with `rational-agnostic init --no-mcp`.

**The CLI needs none of this** — every operation is also a command, so any agent
can use rational-agnostic with zero setup by running `npx rational-agnostic …`
straight from `AGENTS.md`. MCP is just a more token-efficient interface on top.

## Connect an AI agent (MCP) manually

If a client wasn't auto-wired, add this stdio server to its config:

```json
{
  "mcpServers": {
    "rational-agnostic": { "command": "npx", "args": ["-y", "rational-agnostic", "mcp"] }
  }
}
```

The agent then sees 22 tools — `get_context`, `search`, `record_decision`,
`tag_code`, `create_task`, `set_task_status`, `read_memory`, `append_memory`,
`record_learning`, `distill`, `verify`, and more. Agents are told how to use them
by the generated `AGENTS.md`.

## What gets stored

```
AGENTS.md                      generic manifest: how to use the package + where things live
.rational-agnostic/
  config.json                  locale, canonical "en", embeddings provider, verify rules
  decisions/   D-*.md          one decision per file (Context / Decision / Why / Consequences)
  tasks/       T-*.md           one task per file
               board.json       status index
  memory/      shared.md        cross-agent shared memory
               agents/*.md      per-agent scratch
  knowledge/   learnings.md     accumulated learnings
               conventions.md   emergent conventions
  index/       registry.json    code anchor -> decision map (+ SHA for drift)
               embeddings/       rebuildable semantic index (gitignored)
```

## Semantic retrieval & tokens

Search and `get_context` use embeddings. Out of the box they run on a
**deterministic lexical embedder** with **zero extra dependencies** — nothing to
download, no network, no native binaries. For higher-quality semantic search you
can opt into a **local, offline transformer model** (`Xenova/all-MiniLM-L6-v2`,
no API key) by installing the optional peer:

```bash
npm install @huggingface/transformers    # optional; enables the local model
```

It is **not a dependency** on purpose: it pulls `sharp`/`onnxruntime` (~135 MB,
and the source of the libvips/libheif/librsvg advisories if you add it). When
absent, the lexical fallback keeps search working everywhere; when present, the
code detects and uses it automatically. The vector index is a rebuildable cache —
the markdown files are always the source of truth:

```bash
rational-agnostic search "how are auth tokens issued"
rational-agnostic context --task T-0001 --budget 1500
rational-agnostic reindex
```

## Library

```ts
import { init, decisions, getContext, verify } from "rational-agnostic";
```

## Documentation

A detailed, self-contained explainer (what was built, why, and how it works) is
in [`docs/how-it-works.html`](https://github.com/fagugon283/rational/blob/main/docs/how-it-works.html)
— clone the repo and open it in a browser. Available in English (primary),
Spanish, Chinese and Japanese via the in-page language switcher.

## Security & footprint

The default install is deliberately lean and **`npm audit` reports 0
vulnerabilities** — no native binaries, no install scripts, no network access at
install time:

- **Heavy ML stack is opt-in.** `@huggingface/transformers` (and its `sharp` /
  `onnxruntime` subtree, ~135 MB, which carried the libvips/libheif/librsvg
  advisories) is **not** declared as a dependency at all. The embedder loads it
  via a guarded, indirect dynamic `import` only if you install it yourself, so
  the default footprint stays ~24 MB and clean.
- **Small, trusted runtime deps.** `commander` (CLI, zero-dep), `gray-matter`
  (YAML frontmatter), `proper-lockfile` (safe cross-process writes),
  `zod` **≥ 4.6.7** (schema validation, past the
  [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) DoS)
  and the official `@modelcontextprotocol/sdk`.
- **Deliberately not reinvented.** YAML frontmatter, cross-process locking and
  CLI parsing stay on their small, trusted libraries: a hand-rolled replacement
  would trade a negligible supply-chain reduction for real correctness risk
  (your decision records are hand-editable and must round-trip exactly).

Run `npm audit` any time to check the current state. Report a vulnerability via
the repo's [issues](https://github.com/fagugon283/rational/issues).

## License

MIT © Paco Aguilera
