import { INLINE_TASK_RE, STATUS_COMMENT_RE } from './tasks';
import type { TaskStatus } from '@shared/schemas';

/**
 * Mutate a single inline-task line so that it reflects `status`.
 *
 * Rules (documented in `docs/architecture.md`):
 * - `done` → checkbox becomes `[x]` and any `<!-- orbit:status=... -->` tag
 *   is removed.
 * - `backlog` → checkbox becomes `[ ]` and the status comment is removed
 *   (backlog is the implicit default for an unchecked box).
 * - `waiting` | `todo` | `doing` | `blocked` → checkbox becomes `[ ]` and the trailing
 *   comment is set to `<!-- orbit:status=${status} -->`, creating or
 *   replacing it as needed.
 */
export function setInlineTaskStatus(line: string, status: TaskStatus): string {
  const m = line.match(INLINE_TASK_RE);
  if (!m) return line;
  const indent = m[1] ?? '';
  let body = (m[3] ?? '').replace(STATUS_COMMENT_RE, '').trimEnd();
  const checkbox = status === 'done' ? '[x]' : '[ ]';
  if (status !== 'done' && status !== 'backlog') {
    body = `${body} <!-- orbit:status=${status} -->`.trim();
  }
  return `${indent}- ${checkbox} ${body}`.replace(/\s+$/, '');
}

/**
 * Apply `setInlineTaskStatus` to the given 1-based `line` of `content`. If the
 * line doesn't contain an inline task, returns `content` unchanged.
 */
export function applyInlineTaskStatus(
  content: string,
  line: number,
  status: TaskStatus
): string {
  const parts = content.split(/\r?\n/);
  const idx = line - 1;
  if (idx < 0 || idx >= parts.length) return content;
  const orig = parts[idx] ?? '';
  const next = setInlineTaskStatus(orig, status);
  if (next === orig) return content;
  parts[idx] = next;
  // Preserve original line ending style heuristically: if source contained
  // any CRLFs, rejoin with CRLF; otherwise LF.
  const joiner = /\r\n/.test(content) ? '\r\n' : '\n';
  return parts.join(joiner);
}
