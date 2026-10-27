---
id: D-f6dbeb
title: 'Position as a layer above agent frameworks, not a framework'
status: accepted
date: '2026-10-27'
author: 'agent:anthropic:claude-code'
supersedes: []
tags:
  - positioning
  - scope
summary: rational-agnostic governs any agent; it is not an agent runtime
---

## Context
Letta/Mem0 provide memory and LangGraph/CrewAI/Mastra provide orchestration, but all are tied to their own runtime.

## Decision
Stay a file-based governance/traceability layer that any vendor's agent reads/writes via MCP or CLI; the LLM does the understanding, the tool never fabricates rationale.

## Why
The market gap is a neutral, portable record above frameworks; keeping the tool deterministic preserves integrity.

## Consequences
The tool cannot infer intent by itself; brownfield adoption relies on a user-chosen agent.
