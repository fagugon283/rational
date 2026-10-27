// Thin wrapper over gray-matter so stores read/write YAML frontmatter + body.
// @why: D-0006
import matter from "gray-matter";

export interface Parsed<T> {
  data: T;
  body: string;
}

/** Parse a markdown document into typed frontmatter + body. */
export function parse<T extends object>(raw: string): Parsed<T> {
  const { data, content } = matter(raw);
  return { data: data as T, body: content.trim() };
}

/** Serialize frontmatter + body back into a markdown document. */
export function stringify(data: object, body: string): string {
  // gray-matter.stringify writes frontmatter then the content.
  return matter.stringify(`\n${body.trim()}\n`, data);
}
