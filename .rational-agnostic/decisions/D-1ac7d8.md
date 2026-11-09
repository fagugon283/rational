---
id: D-1ac7d8
title: Drop @huggingface/transformers from default install to shrink attack surface
status: accepted
date: '2026-11-09'
author: 'agent:anthropic:claude-code'
supersedes: []
tags:
  - security
  - dependencies
  - embeddings
summary: >-
  Move the local-model embedder dependency out of the default install; keep it
  as an opt-in since the lexical fallback already covers the default path
---

## Context
npm audit and Socket flag the dependency tree: all 3 high CVEs (sharp/libvips/libheif/librsvg) plus install-scripts, network, shell and eval flags come from @huggingface/transformers and its subtree (~135MB). It was in optionalDependencies, which npm installs by default.

## Decision
Remove @huggingface/transformers from optionalDependencies so it is NOT installed by default. The embeddings code already dynamic-imports it with a try/catch and degrades to the deterministic lexical embedder when absent. Advanced users opt in with 'npm i @huggingface/transformers'. Keep gray-matter, proper-lockfile, commander and zod: reimplementing them would trade a negligible supply-chain reduction for real correctness risk (YAML round-trip of hand-edited records, cross-process locking, CLI parsing).

## Why
Concentrating ~90% of the flagged risk in one optional dependency means removing it from the default path eliminates all 3 high CVEs and most Socket flags with zero behavior loss, while the remaining small deps are trusted and safer kept than rewritten.

## Consequences
