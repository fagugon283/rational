// Shared type definitions for rational-agnostic.
// All persisted content is canonical English regardless of the user's working locale.
// @why: D-0001

/** Lifecycle status of an architecture/decision record. */
export type DecisionStatus = "proposed" | "accepted" | "superseded" | "deprecated";

/** Lifecycle status of a task on the board. */
export type TaskStatus =
  | "backlog"
  | "todo"
  | "doing"
  | "review"
  | "blocked"
  | "done";

/** A vendor-neutral actor identity, e.g. "agent:anthropic:claude-code" or "human:paco". */
export type ActorId = string;

/** One decision record (ADR-style). Body sections live in the markdown file. */
export interface Decision {
  id: string; // e.g. D-7f3a2c
  title: string;
  status: DecisionStatus;
  date: string; // ISO date (YYYY-MM-DD)
  author: ActorId;
  task?: string; // related task id
  supersedes: string[];
  tags: string[];
  summary: string; // one-line, English, used by indexes to save tokens
  body: string; // markdown: Context / Decision / Why / Consequences
}

/** One task. */
export interface Task {
  id: string; // e.g. T-0012
  title: string;
  status: TaskStatus;
  assignee?: ActorId;
  decisions: string[];
  created: string; // ISO datetime
  updated: string; // ISO datetime
  summary: string; // one-line, English
  body: string; // markdown: Goal / Notes
}

/** One distilled learning the system has accumulated. */
export interface Learning {
  id: string; // e.g. L-0003
  date: string;
  author: ActorId;
  source: string[]; // decision/task/file ids this was distilled from
  summary: string; // one-line, English
  body: string;
  tags: string[];
}

/** A place in the codebase that carries a @why tag, tracked for drift detection. */
export interface CodeAnchor {
  file: string; // repo-relative path
  symbol: string; // function/class/const name the tag applies to
  sha256: string; // hash of the anchored body at tag time (drift detection)
  taggedAt: string; // ISO datetime
  taggedBy: ActorId;
}

/** registry.json: decision id -> where it is referenced in code + metadata. */
export interface Registry {
  version: 1;
  anchors: Record<string, CodeAnchor[]>; // decisionId -> anchors
  updatedAt: string;
}

/** Embedding provider configuration. */
export interface EmbeddingsConfig {
  provider: "local" | "openai" | "voyage" | "none";
  model: string;
  dimensions?: number;
}

/** config.json contents. */
export interface RaConfig {
  version: 1;
  locale: string; // the user's working language, e.g. "es"
  canonical: "en"; // persisted content language — always English
  embeddings: EmbeddingsConfig;
  rules: {
    requireWhyTag: boolean; // verify fails on untagged new functions
    requireTaskStatus: boolean; // verify fails on tasks without a valid status
    failOnOrphans: boolean; // verify fails on decisions referenced but missing
  };
}
