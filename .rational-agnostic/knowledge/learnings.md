# Learnings

Accumulated, reusable insights. Append with `record_learning` or `distill`.

## L-0001 — Competitive landscape for AI-agent governance/memory (Oct 2026)
<!-- meta: {"date":"2026-10-27T18:53:43.443Z","author":"agent:anthropic:claude-code","source":[],"tags":["competition","landscape"]} -->

AGENTS.md is an open standard under the Agentic AI Foundation (Linux Foundation; OpenAI/Anthropic/Block), read by 20-25 tools. Shared memory: Letta (shared memory blocks) and Mem0, but framework-bound and not editor-agnostic. Decision traceability: the ADR pattern (docs/adr, ids referenced in code) is the closest prior art; no tool does per-function SHA->decision lookup well. Orchestration/state: LangGraph, CrewAI, Mastra (TS), orc. Gap filled by rational-agnostic: a neutral, file-based governance+traceability+memory layer above any framework, English-canonical.

## L-0002 — Core design principles agreed in this session
<!-- meta: {"date":"2026-10-27T18:53:43.820Z","author":"agent:anthropic:claude-code","source":[],"tags":["principles","design"]} -->

1) Never fabricate rationale: the LLM records why; the deterministic tool only inventories/plans. 2) English-canonical persistence regardless of user locale. 3) Token-aware retrieval: get_context returns a budgeted, ranked bundle instead of dumping history. 4) Traceability via stable @why tags + a registry storing SHA-256 of bodies (reverse lookup by file+symbol or by hash; drift detection). 5) Files + cross-process locking so agents of different vendors collaborate without a server. 6) Local embeddings by default (all-MiniLM) with a deterministic lexical fallback. 7) AGENTS.md describes HOW to use the system, never the host project's domain.
