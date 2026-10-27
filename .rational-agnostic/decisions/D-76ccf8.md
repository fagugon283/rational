---
id: D-76ccf8
title: Defer central daemon and auto-translation from the MVP
status: accepted
date: '2026-10-27'
author: 'agent:anthropic:claude-code'
supersedes: []
tags:
  - scope
  - mvp
summary: MVP stays local files + locking; English written directly by agents
---

## Context
Options considered included a multi-machine daemon and automatic translation of non-English input.

## Decision
Keep storage to local versionable files with file locking; agents write English directly rather than a translation layer.

## Why
Lower complexity, no server/infra, git-portable; translation is better handled by the agent than a bundled translator.

## Consequences
Multi-machine team sync and non-English auto-normalization are future work.
