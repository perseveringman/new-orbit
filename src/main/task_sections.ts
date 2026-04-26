/**
 * Four-section task body parser/serializer.
 *
 * Every task markdown created by R1's `createTask` emits four H1 anchors:
 *   # Description
 *   # Agent Thinking
 *   # Execution Log
 *   # Summary
 *
 * R3 turns those anchors into a structured editing surface. This module is
 * the source of truth for splitting and rejoining those sections so the main
 * process IPC handlers and the renderer (TaskEditor)
 * never disagree about byte boundaries.
 *
 * Rules:
 *  - Anchors are case-sensitive level-1 headings (`^# Name\s*$`).
 *  - The heading line itself is consumed by the parser and re-emitted by the
 *    serializer. Only the *content* between headings is preserved.
 *  - Any content before the first known anchor, or under a non-canonical H1
 *    heading, flows into `other` so user-added sections survive round trips.
 *  - Missing sections parse to empty strings and are *not* auto-inserted on
 *    serialize unless they become non-empty. `appendToSection` is the explicit
 *    way to materialize a missing section.
 */

export type TaskSectionKey = 'description' | 'thinking' | 'executionLog' | 'summary';

export interface TaskSections {
  description: string;
  thinking: string;
  executionLog: string;
  summary: string;
  other: string;
}

const ANCHORS: Record<TaskSectionKey, string> = {
  description: '# Description',
  thinking: '# Agent Thinking',
  executionLog: '# Execution Log',
  summary: '# Summary'
};

const TITLE_TO_KEY: Record<string, TaskSectionKey> = {
  Description: 'description',
  'Agent Thinking': 'thinking',
  'Execution Log': 'executionLog',
  Summary: 'summary'
};

const ANCHOR_RE = /^# (Description|Agent Thinking|Execution Log|Summary)\s*$/;

/** Detect whether a line begins a canonical four-section anchor. */
function matchAnchor(line: string): TaskSectionKey | null {
  const m = line.match(ANCHOR_RE);
  if (!m) return null;
  return TITLE_TO_KEY[m[1]!] ?? null;
}

/** Split a task body into the four canonical sections plus any leftover. */
export function parseTaskSections(body: string): TaskSections {
  const lines = body.split('\n');
  const sections: TaskSections = {
    description: '',
    thinking: '',
    executionLog: '',
    summary: '',
    other: ''
  };
  const buckets: Record<TaskSectionKey | 'other', string[]> = {
    description: [],
    thinking: [],
    executionLog: [],
    summary: [],
    other: []
  };
  let current: TaskSectionKey | 'other' = 'other';
  let sawAnchor = false;

  // Everything before the first canonical anchor (including any non-canonical
  // H1 like "# Notes") goes into `other`. After the first anchor fires we
  // switch into that section's bucket. If another canonical anchor fires,
  // switch again; if a non-canonical H1 fires after an anchor, it still flows
  // into `other` to keep user-authored sections intact.
  for (const raw of lines) {
    const anchor = matchAnchor(raw);
    if (anchor) {
      current = anchor;
      sawAnchor = true;
      continue;
    }
    if (sawAnchor && /^# \S/.test(raw) && !matchAnchor(raw)) {
      // A non-canonical H1 after an anchor — dump to `other` from here on.
      current = 'other';
      buckets.other.push(raw);
      continue;
    }
    buckets[current].push(raw);
  }

  sections.description = trimSectionBody(buckets.description);
  sections.thinking = trimSectionBody(buckets.thinking);
  sections.executionLog = trimSectionBody(buckets.executionLog);
  sections.summary = trimSectionBody(buckets.summary);
  sections.other = trimSectionBody(buckets.other);
  return sections;
}

function trimSectionBody(lines: string[]): string {
  // Drop leading + trailing blank lines; internal formatting is preserved
  // byte-for-byte so the user's spacing survives round-trips.
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]!.trim() === '') start++;
  while (end > start && lines[end - 1]!.trim() === '') end--;
  return lines.slice(start, end).join('\n');
}

/**
 * Reassemble a body from {@link TaskSections}. Sections appear in a stable
 * order: Description → Agent Thinking → Execution Log → Summary → other. A
 * missing (empty) section is omitted entirely. The emitted body always ends
 * with exactly one trailing newline so file writes stay idempotent.
 */
export function serializeTaskSections(sections: TaskSections): string {
  const parts: string[] = [];
  for (const key of ['description', 'thinking', 'executionLog', 'summary'] as const) {
    const content = sections[key];
    if (content.trim().length === 0) continue;
    parts.push(`${ANCHORS[key]}\n${content}\n`);
  }
  if (sections.other.trim().length > 0) {
    parts.push(`${sections.other}\n`);
  }
  if (parts.length === 0) return '';
  return parts.join('\n');
}

/**
 * Replace a single section's content, leaving all other sections intact.
 * Empty content effectively deletes the section (serializer skips empties).
 */
export function setSection(
  body: string,
  section: TaskSectionKey,
  content: string
): string {
  const s = parseTaskSections(body);
  s[section] = content;
  return serializeTaskSections(s);
}

/**
 * Append `line` (a single line, no trailing newline) to the end of `section`.
 * If the section is missing it is created. Returns the full new body.
 */
export function appendToSection(
  body: string,
  section: TaskSectionKey,
  line: string
): string {
  const s = parseTaskSections(body);
  const existing = s[section];
  s[section] = existing.length === 0 ? line : `${existing}\n${line}`;
  return serializeTaskSections(s);
}
