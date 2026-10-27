// Task store: one markdown file per task + a board.json status index.
// The board lets any agent answer "what is each task's state?" cheaply.
// @why: D-0011
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Task, TaskStatus } from "../core/types.js";
import { readJson, readText, writeFileAtomic, writeJson } from "../core/fsutil.js";
import { parse, stringify } from "../core/frontmatter.js";
import { nextSeqId, TASK_RE } from "../core/ids.js";
import { withLock } from "../core/lock.js";
import { requirePaths, type RaPaths } from "../core/paths.js";

const STATUSES: TaskStatus[] = [
  "backlog",
  "todo",
  "doing",
  "review",
  "blocked",
  "done",
];

interface TaskFront {
  id: string;
  title: string;
  status: TaskStatus;
  assignee?: string;
  decisions?: string[];
  created: string;
  updated: string;
  summary: string;
}

interface BoardEntry {
  status: TaskStatus;
  title: string;
  assignee?: string;
  updated: string;
}
interface Board {
  version: 1;
  tasks: Record<string, BoardEntry>;
}

export function isStatus(s: string): s is TaskStatus {
  return (STATUSES as string[]).includes(s);
}

function file(paths: RaPaths, id: string): string {
  return join(paths.tasks, `${id}.md`);
}

export function listIds(paths: RaPaths): string[] {
  if (!existsSync(paths.tasks)) return [];
  return readdirSync(paths.tasks)
    .filter((f) => f.endsWith(".md") && TASK_RE.test(f.replace(/\.md$/, "")))
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
}

export function get(paths: RaPaths, id: string): Task | null {
  const p = file(paths, id);
  if (!existsSync(p)) return null;
  const { data, body } = parse<TaskFront>(readText(p));
  return {
    id: data.id,
    title: data.title,
    status: data.status,
    assignee: data.assignee,
    decisions: data.decisions ?? [],
    created: data.created,
    updated: data.updated,
    summary: data.summary,
    body,
  };
}

export function all(paths: RaPaths): Task[] {
  return listIds(paths)
    .map((id) => get(paths, id))
    .filter((t): t is Task => t !== null);
}

export function loadBoard(paths: RaPaths): Board {
  return readJson<Board>(paths.board, { version: 1, tasks: {} });
}

function syncBoard(paths: RaPaths, t: Task): void {
  const board = loadBoard(paths);
  board.tasks[t.id] = {
    status: t.status,
    title: t.title,
    assignee: t.assignee,
    updated: t.updated,
  };
  writeJson(paths.board, board);
}

function persist(paths: RaPaths, t: Task): void {
  const front: TaskFront = {
    id: t.id,
    title: t.title,
    status: t.status,
    ...(t.assignee ? { assignee: t.assignee } : {}),
    decisions: t.decisions,
    created: t.created,
    updated: t.updated,
    summary: t.summary,
  };
  writeFileAtomic(file(paths, t.id), stringify(front, t.body));
  syncBoard(paths, t);
}

export interface NewTaskInput {
  title: string;
  summary: string;
  assignee?: string;
  status?: TaskStatus;
  goal?: string;
  decisions?: string[];
}

/** Create a task and register it on the board. @why: D-0011 */
export async function create(
  input: NewTaskInput,
  startDir = process.cwd(),
): Promise<Task> {
  const paths = requirePaths(startDir);
  return withLock(paths, "tasks", () => {
    const id = nextSeqId("T", new Set(listIds(paths)));
    const now = new Date().toISOString();
    const t: Task = {
      id,
      title: input.title,
      status: input.status ?? "todo",
      assignee: input.assignee,
      decisions: input.decisions ?? [],
      created: now,
      updated: now,
      summary: input.summary,
      body: `## Goal\n${input.goal ?? input.summary}\n\n## Notes\n`,
    };
    persist(paths, t);
    return t;
  });
}

/** Change a task's status (and optionally assignee), keeping the board in sync. */
export async function setStatus(
  id: string,
  status: TaskStatus,
  opts: { assignee?: string; note?: string } = {},
  startDir = process.cwd(),
): Promise<Task> {
  const paths = requirePaths(startDir);
  return withLock(paths, "tasks", () => {
    const t = get(paths, id);
    if (!t) throw new Error(`Task ${id} not found`);
    t.status = status;
    if (opts.assignee) t.assignee = opts.assignee;
    t.updated = new Date().toISOString();
    if (opts.note) {
      t.body = `${t.body.trimEnd()}\n- [${t.updated}] ${status}: ${opts.note}\n`;
    }
    persist(paths, t);
    return t;
  });
}
