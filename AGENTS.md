# AGENTS.md

This repository uses **rational-agnostic** — a vendor-agnostic, file-based
governance and traceability layer for AI coding agents. This file explains
**how to use it** and **where everything is stored**. It intentionally says
nothing about what this project does; that lives in the decision records.

> Any AI agent (from any vendor) that edits this repo MUST follow this protocol.
> All persisted content is written in **English**, even if the user speaks
> another language.

## Where things are stored

```
.rational-agnostic/
  config.json              tool configuration (locale, embeddings, rules)
  decisions/   D-*.md       one decision record per file (why things were done)
  tasks/       T-*.md        one task per file
               board.json    status index for every task
  memory/      shared.md     shared memory across all agents
               agents/*.md   per-agent scratch memory
  knowledge/   learnings.md  accumulated learnings
               conventions.md emergent coding conventions
  index/       registry.json code anchor -> decision map (+ SHA for drift)
               embeddings/   rebuildable semantic index (gitignored)
```

## The protocol (do this, in order)

1. **Load context first (saves tokens):** call `get_context` with your task id
   or a short query. It returns only the relevant decisions, learnings and
   shared-memory tail within a token budget. Do NOT read the whole history.
2. **Have a task:** find it via `list_tasks` or create one with `create_task`.
   Keep its state current with `set_task_status` (backlog → todo → doing →
   review → blocked → done).
3. **Decide before you code:** for any non-trivial choice, call
   `record_decision` (Context / Decision / Why / Consequences, in English).
   It returns a decision id like `D-XXXXXX` (6 hex chars).
4. **Tag the code:** put a comment above each function/symbol you create or
   change:
   ```
   // @why: D-XXXXXX
   ```
   Then register it with `tag_code` (file + symbol + body) so the SHA is stored.
5. **Share what matters:** append cross-agent notes with `append_memory`
   (scope `shared`). Record reusable insights with `record_learning`.
6. **Verify:** `verify` must pass (no orphan tags, valid task statuses).

## Adopting an existing project (brownfield)

If this repo already had code before rational-agnostic was added:

1. Nothing is broken: existing untagged code is allowed. `verify` only fails on
   `@why` tags that point to a missing decision — not on legacy code.
2. Call `adopt_report` (or run `rational-agnostic adopt`) to get an inventory
   (languages, manifests, entry points, largest files, tag coverage) and a plan.
3. Call `start_adoption` once: it records a baseline "as-built" decision, opens
   an adoption task, and posts a brief to shared memory.
4. Then work the plan **incrementally**, largest/most central modules first:
   for each design choice you can infer, `record_decision` and `tag_code`.
5. **Never invent rationale.** If you cannot tell why something exists, append a
   question to shared memory and ask the user — do not fabricate a decision.

## How to find why a function exists

- By location: `rational-agnostic why <file> <symbol>`
- By hash: `rational-agnostic why --hash <sha256>` (hash the function body;
  the registry maps it back to its decision).

## How agents connect

- **MCP-capable agents** (Claude Code, Cursor, Codex, Copilot, Jules, …): add
  this MCP server to your client config:
  ```json
  { "command": "npx", "args": ["rational-agnostic", "mcp"] }
  ```
  Tools: get_context, search, list_tasks, get_task, create_task,
  set_task_status, record_decision, get_decision, list_decisions, tag_code,
  why, read_memory, write_memory, append_memory, record_learning,
  get_learnings, distill, adopt_report, start_adoption, reindex, verify,
  whoami.
- **Other agents / humans:** use the CLI (`rational-agnostic --help`).

## Identity

Identify yourself with a vendor-neutral id: `agent:<vendor>:<name>`, e.g.
`agent:anthropic:claude-code`, `agent:openai:codex`. Humans use `human:<name>`.
