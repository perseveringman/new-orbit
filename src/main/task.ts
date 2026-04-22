import { promises as fs } from 'node:fs';
import * as frontmatter from './frontmatter';
import {
  parseTaskSections,
  serializeTaskSections,
  setSection as setSectionBody,
  appendToSection,
  type TaskSectionKey,
  type TaskSections
} from './task_sections';
import { contentHash } from './content_hash';
import type { TaskFrontmatter as TaskFrontmatterT } from '@shared/schemas';

export type TaskFrontmatterPatch = Partial<Record<keyof TaskFrontmatterT, unknown>>;

export interface TaskFileView {
  frontmatter: Record<string, unknown>;
  sections: TaskSections;
  raw: string;
}

/** Read a task markdown file and return its frontmatter + section split. */
export async function readTaskFile(absPath: string): Promise<TaskFileView> {
  const raw = await fs.readFile(absPath, 'utf8');
  const { data, body } = frontmatter.read(raw);
  return {
    frontmatter: data,
    sections: parseTaskSections(body),
    raw
  };
}

/**
 * Shared low-level writer — preserves body bytes, re-hashes content and
 * notifies the refmap via the caller-supplied `onWritten` hook.
 */
async function atomicRewrite(
  absPath: string,
  mutator: (raw: string) => string,
  onWritten?: (next: string) => void | Promise<void>
): Promise<string> {
  const raw = await fs.readFile(absPath, 'utf8');
  const next = mutator(raw);
  if (next === raw) return raw;
  await fs.writeFile(absPath, next, 'utf8');
  if (onWritten) await onWritten(next);
  return next;
}

/**
 * Replace only the task frontmatter, leaving the markdown body byte-for-byte
 * identical. Keys set to `undefined` in `patch` are removed entirely.
 */
export async function updateTaskFrontmatter(
  absPath: string,
  patch: TaskFrontmatterPatch,
  onWritten?: (next: string) => void | Promise<void>
): Promise<string> {
  return atomicRewrite(
    absPath,
    (raw) => frontmatter.update(raw, patch as Record<string, unknown>).content,
    onWritten
  );
}

/**
 * Replace the content of a single named section. Frontmatter is untouched;
 * other sections and `other` content are preserved.
 */
export async function updateTaskSection(
  absPath: string,
  section: TaskSectionKey,
  content: string,
  onWritten?: (next: string) => void | Promise<void>
): Promise<string> {
  return atomicRewrite(
    absPath,
    (raw) => {
      const { data, body, raw: fmRaw } = frontmatter.read(raw);
      const newBody = setSectionBody(body, section, content);
      if (newBody === body) return raw;
      // Preserve the on-disk fence verbatim when we have one; otherwise
      // re-emit via `frontmatter.write` so we still produce a `---` block.
      return fmRaw ? `${fmRaw}${newBody}` : frontmatter.write(data, newBody);
    },
    onWritten
  );
}

/** Append a dated entry to `# Execution Log`. Used by the MCP layer in R5. */
export async function appendExecutionLog(
  absPath: string,
  line: string,
  nowIso?: string,
  onWritten?: (next: string) => void | Promise<void>
): Promise<string> {
  const stamp = nowIso ?? new Date().toISOString();
  const formatted = `- [${stamp}] ${line}`;
  return atomicRewrite(
    absPath,
    (raw) => {
      const { data, body, raw: fmRaw } = frontmatter.read(raw);
      const newBody = appendToSection(body, 'executionLog', formatted);
      return fmRaw ? `${fmRaw}${newBody}` : frontmatter.write(data, newBody);
    },
    onWritten
  );
}

/** Re-export used by tests + callers so they stay in this module's orbit. */
export { parseTaskSections, serializeTaskSections, contentHash };
