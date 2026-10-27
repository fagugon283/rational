# rational-agnostic

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

```bash
cd your-repo
rational-agnostic init            # creates AGENTS.md + .rational-agnostic/
```

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

## Connect an AI agent (MCP)

Add the server to any MCP-capable client (Claude Code, Cursor, Codex, Copilot, …):

```json
{
  "mcpServers": {
    "rational-agnostic": { "command": "npx", "args": ["rational-agnostic", "mcp"] }
  }
}
```

The agent then sees 20 tools — `get_context`, `search`, `record_decision`,
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

Search and `get_context` use embeddings. The default is a **local, offline model**
(`Xenova/all-MiniLM-L6-v2`, no API key); if its optional dependency isn't present,
a deterministic lexical fallback keeps search working everywhere. The vector index
is a rebuildable cache — the markdown files are always the source of truth:

```bash
rational-agnostic search "how are auth tokens issued"
rational-agnostic context --task T-0001 --budget 1500
rational-agnostic reindex
```

## Library

```ts
import { init, decisions, getContext, verify } from "rational-agnostic";
```

## License

MIT © Paco Aguilera
