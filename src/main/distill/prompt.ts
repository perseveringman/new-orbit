import type { TaskRecord } from '@shared/schemas';
import type { CostRecord } from '@shared/agent';
import { DISTILL_PERSONA, DISTILL_SECTIONS } from './persona';

/** Max chars from the archived project body; head + tail slices. */
export const PROJECT_BODY_CAP = 8000;
/** Per-related-file excerpt cap. */
export const FILE_EXCERPT_CAP = 1200;

export interface RelatedFile {
  relPath: string;
  title: string;
  body: string;
}

export interface GitLogEntry {
  at: string;
  kind?: string;
  message?: string;
  sha?: string;
  /** Free-form; we only stringify for the prompt. */
  [key: string]: unknown;
}

export interface DistillPromptArgs {
  projectUid: string;
  projectTitle: string;
  archivedRelPath: string;
  projectBody: string;
  relatedFiles: RelatedFile[];
  tasks: TaskRecord[];
  gitLog: GitLogEntry[];
  costRecords: CostRecord[];
  /** Lifecycle ISO range for the cost snapshot context. */
  lifecycle?: { from?: string; to?: string };
}

/**
 * Collapse a long body into a head + tail pair so the prompt stays under
 * the truncation cap without losing either endpoint.
 */
export function clipHeadTail(body: string, cap: number): string {
  if (body.length <= cap) return body;
  const half = Math.floor(cap / 2) - 20;
  const head = body.slice(0, Math.max(0, half));
  const tail = body.slice(body.length - Math.max(0, half));
  return `${head}\n\n…[truncated ${body.length - cap} chars]…\n\n${tail}`;
}

export function composeDistillPrompt(args: DistillPromptArgs): string {
  const parts: string[] = [];
  parts.push(`# Persona\n${DISTILL_PERSONA}`);
  parts.push(
    `# Project\n- title: ${args.projectTitle}\n- uid: ${args.projectUid}\n- archive: ${args.archivedRelPath}`
  );
  parts.push(`# Project body\n${clipHeadTail(args.projectBody, PROJECT_BODY_CAP)}`);

  const related = args.relatedFiles.slice(0, 20);
  if (related.length > 0) {
    const rows = related.map((f) => {
      const body = clipHeadTail(f.body, FILE_EXCERPT_CAP);
      return `## ${f.relPath} — ${f.title}\n${body}`;
    });
    parts.push(`# Related files (${related.length})\n${rows.join('\n\n')}`);
  } else {
    parts.push(`# Related files\n(none)`);
  }

  const closedTasks = args.tasks.filter((t) => t.status === 'done');
  if (closedTasks.length > 0) {
    const rows = closedTasks.slice(0, 100).map((t) => {
      const bits: string[] = [`- [x] ${t.title}`];
      if (t.due) bits.push(`(due ${t.due})`);
      bits.push(`— ${t.relPath}`);
      return bits.join(' ');
    });
    parts.push(`# Closed tasks (${closedTasks.length})\n${rows.join('\n')}`);
  } else {
    parts.push(`# Closed tasks\n(none)`);
  }

  const git = args.gitLog.slice(0, 50);
  if (git.length > 0) {
    const rows = git.map((g) => {
      const label = [g.kind, g.message, g.sha ? `sha=${g.sha}` : '']
        .filter(Boolean)
        .join(' ');
      return `- ${g.at} — ${label || '(event)'}`;
    });
    parts.push(`# Git activity (${git.length})\n${rows.join('\n')}`);
  } else {
    parts.push(`# Git activity\n(none)`);
  }

  if (args.costRecords.length > 0) {
    let tokens = 0;
    let usd = 0;
    for (const r of args.costRecords) {
      tokens += r.input + r.output;
      usd += r.estUSD;
    }
    const range = args.lifecycle
      ? `${args.lifecycle.from ?? '?'} → ${args.lifecycle.to ?? '?'}`
      : 'lifecycle';
    parts.push(
      `# Cost snapshot\n- records: ${args.costRecords.length}\n- tokens: ${tokens}\n- est USD: $${usd.toFixed(4)}\n- range: ${range}`
    );
  } else {
    parts.push(`# Cost snapshot\n(no cost records in lifecycle)`);
  }

  parts.push(
    [
      `# Response template`,
      `Respond with the following sections, **exactly** these H2 headers in this order, plain Markdown:`,
      '',
      ...DISTILL_SECTIONS.map((s) => `## ${s}\n<content for ${s}>`),
      '',
      `Do not add extra sections. Keep each section tight and factual — cite exact file names (e.g. \`01_Projects/Foo.md\`) when referencing. If a section has no content, write "(none)".`
    ].join('\n')
  );

  return parts.join('\n\n');
}

/**
 * Split a distillation response into its seven required sections. Missing
 * headers fall back to `(none)`. Tolerant to extra H2 blocks that the
 * model occasionally emits.
 */
export function parseDistillResponse(text: string): Record<DistillSectionKey, string> {
  const out: Record<string, string> = {};
  const re = /^##\s+(.+?)\s*$/gm;
  type Marker = { name: string; start: number; end: number };
  const markers: Marker[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    markers.push({ name: (m[1] ?? '').trim(), start: m.index, end: m.index + m[0].length });
  }
  for (let i = 0; i < markers.length; i++) {
    const cur = markers[i]!;
    const next = markers[i + 1];
    const bodyStart = cur.end;
    const bodyEnd = next ? next.start : text.length;
    out[cur.name] = text.slice(bodyStart, bodyEnd).trim();
  }
  const result: Record<string, string> = {};
  for (const s of DISTILL_SECTIONS) {
    result[s] = out[s]?.trim() || '(none)';
  }
  return result as Record<DistillSectionKey, string>;
}

export type DistillSectionKey = (typeof DISTILL_SECTIONS)[number];

/** Render a parsed response back into markdown body, in canonical order. */
export function renderDistillBody(
  sections: Record<DistillSectionKey, string>
): string {
  const out: string[] = [];
  for (const s of DISTILL_SECTIONS) {
    out.push(`## ${s}`);
    out.push('');
    out.push(sections[s] || '(none)');
    out.push('');
  }
  return out.join('\n').trim() + '\n';
}
