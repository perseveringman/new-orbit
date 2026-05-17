import type { DailyStats, DailyTimeline, TimelineEntry, TimelineRef } from '@shared/timeline';
import type { SynthesisSource, SynthesisSourceKind } from '@shared/synthesis';
import { createNoteStore } from '../note/store';
import { createLibraryStore } from '../library/store';
import { createResourceStore } from '../resource/store';
import { createScheduledTaskStore } from '../scheduled-task/store';
import { ConversationStore } from '../conversation/store';
import { currentSession } from '../fs';

export interface DailyEvidenceItem {
  id: string;
  kind: SynthesisSourceKind | 'scheduled_task';
  ref?: string;
  title: string;
  summary?: string;
  excerpt?: string;
  occurred_at: string;
  local_date: string;
  local_time: string;
  event_id: string;
  event_kind: string;
  refs?: TimelineRef[];
}

export interface DailyContextPacket {
  date: string;
  range: { from: string; to: string };
  timezone: string;
  stats: DailyStats;
  entries: Array<
    Pick<TimelineEntry, 'event_id' | 'event_kind' | 'occurred_at' | 'title' | 'summary' | 'refs'> & {
      local_date: string;
      local_time: string;
    }
  >;
  evidence: DailyEvidenceItem[];
  coverage: {
    evidence_count: number;
    included_kinds: string[];
    omitted_count: number;
  };
  gaps: string[];
}

export interface DailyContextBuildResult {
  packet: DailyContextPacket;
  sources: SynthesisSource[];
}

const OMITTED_FROM_SUMMARY = new Set(['daily_summary.generated']);

export async function buildDailyContextPacket(vaultPath: string, timeline: DailyTimeline): Promise<DailyContextBuildResult> {
  const usableEntries = timeline.entries.filter((entry) => !OMITTED_FROM_SUMMARY.has(entry.event_kind));
  const evidence: DailyEvidenceItem[] = [];
  const gaps: string[] = [];

  for (const entry of usableEntries) {
    const loaded = await evidenceForEntry(vaultPath, entry).catch((error: unknown) => {
      gaps.push(`${entry.event_kind}:${error instanceof Error ? error.message : String(error)}`);
      return [];
    });
    if (loaded.length) evidence.push(...loaded);
    else evidence.push(eventEvidence(entry, evidence.length + 1));
  }

  const normalized = evidence.map((item, index) => ({ ...item, id: item.id || `ev-${index + 1}` }));
  const packet: DailyContextPacket = {
    date: timeline.date,
    range: { from: `${timeline.date}T00:00:00.000Z`, to: `${timeline.date}T23:59:59.999Z` },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
    stats: timeline.stats,
    entries: usableEntries.map((entry) => ({
      event_id: entry.event_id,
      event_kind: entry.event_kind,
      occurred_at: entry.occurred_at,
      local_date: localDateKey(entry.occurred_at),
      local_time: localTimeLabel(entry.occurred_at),
      title: entry.title,
      summary: entry.summary,
      refs: entry.refs
    })),
    evidence: normalized,
    coverage: {
      evidence_count: normalized.length,
      included_kinds: [...new Set(normalized.map((item) => item.event_kind))],
      omitted_count: timeline.entries.length - usableEntries.length
    },
    gaps
  };

  return {
    packet,
    sources: [
      {
        kind: 'timeline_range',
        ref: timeline.date,
        range: packet.range,
        title: `${timeline.date} 每日证据包`,
        metadata: { packet }
      },
      ...normalized.map(sourceFromEvidence)
    ]
  };
}

async function evidenceForEntry(vaultPath: string, entry: TimelineEntry): Promise<DailyEvidenceItem[]> {
  const refs = entry.refs ?? [];
  if (!refs.length) return [eventEvidence(entry, 1)];
  const items = await Promise.all(refs.map((ref, index) => evidenceForRef(vaultPath, entry, ref, index + 1)));
  return items.filter((item): item is DailyEvidenceItem => item !== null);
}

async function evidenceForRef(
  vaultPath: string,
  entry: TimelineEntry,
  ref: TimelineRef,
  index: number
): Promise<DailyEvidenceItem | null> {
  if (ref.kind === 'note') {
    const note = await createNoteStore(vaultPath).getByPath(ref.ref).catch(() => null);
    if (!note) return eventEvidence(entry, index, ref);
    return {
      ...baseEvidence(entry, index, 'note', ref.ref, note.frontmatter.title ?? ref.label ?? '笔记'),
      summary: `${note.frontmatter.type} · ${note.frontmatter.word_count ?? 0} 字`,
      excerpt: clip(note.body, 1_600),
      refs: entry.refs
    };
  }
  if (ref.kind === 'library') {
    const item = await createLibraryStore(vaultPath).get(ref.ref).catch(() => null);
    if (!item) return eventEvidence(entry, index, ref);
    return {
      ...baseEvidence(entry, index, 'library', ref.ref, item.frontmatter.title ?? ref.label ?? '资料'),
      summary: `${item.frontmatter.kind} · ${item.frontmatter.status}`,
      excerpt: clip([item.body, annotationsText(item.frontmatter.annotations)].filter(Boolean).join('\n\n'), 1_600),
      refs: entry.refs
    };
  }
  if (ref.kind === 'resource') {
    const resource = await createResourceStore(vaultPath).get(ref.ref).catch(() => null);
    if (!resource) return eventEvidence(entry, index, ref);
    return {
      ...baseEvidence(entry, index, 'resource', ref.ref, resource.frontmatter.title ?? ref.label ?? '资源'),
      summary: `${resource.frontmatter.status} · ${resource.frontmatter.depth}`,
      excerpt: clip(
        [
          resource.body,
          ...resource.timeline.slice(-6).map((item) => [item.title, item.summary].filter(Boolean).join(' - '))
        ].filter(Boolean).join('\n\n'),
        1_600
      ),
      refs: entry.refs
    };
  }
  if (ref.kind === 'conversation') {
    const conversation = await new ConversationStore(vaultPath).get(ref.ref).catch(() => null);
    if (!conversation) return eventEvidence(entry, index, ref);
    return {
      ...baseEvidence(entry, index, 'conversation', ref.ref, conversation.title ?? ref.label ?? '对话'),
      summary: `${conversation.turns.length} 轮对话`,
      excerpt: clip(
        conversation.turns
          .slice(-12)
          .map((turn) => `${turn.role}: ${turn.content}`)
          .join('\n'),
        2_000
      ),
      refs: entry.refs
    };
  }
  if (ref.kind === 'task') {
    const task = currentSession()?.tasks.allTasks().find((item) => item.id === ref.ref || item.uid === ref.ref);
    if (task) {
      return {
        ...baseEvidence(entry, index, 'task', ref.ref, task.title ?? ref.label ?? '任务'),
        summary: `状态：${task.status}`,
        excerpt: clip([task.title, task.relPath, task.blocked_reason].filter(Boolean).join('\n'), 800),
        refs: entry.refs
      };
    }
    const scheduled = await createScheduledTaskStore(vaultPath).get(ref.ref).catch(() => null);
    if (scheduled) {
      return {
        ...baseEvidence(entry, index, 'scheduled_task', ref.ref, scheduled.name),
        summary: `状态：${scheduled.status}`,
        excerpt: clip([scheduled.description, JSON.stringify(scheduled.action)].filter(Boolean).join('\n'), 800),
        refs: entry.refs
      };
    }
    return eventEvidence(entry, index, ref);
  }
  return eventEvidence(entry, index, ref);
}

function baseEvidence(
  entry: TimelineEntry,
  index: number,
  kind: DailyEvidenceItem['kind'],
  ref: string,
  title: string
): DailyEvidenceItem {
  return {
    id: `${entry.event_id}:${index}`,
    kind,
    ref,
    title,
    occurred_at: entry.occurred_at,
    local_date: localDateKey(entry.occurred_at),
    local_time: localTimeLabel(entry.occurred_at),
    event_id: entry.event_id,
    event_kind: entry.event_kind
  };
}

function eventEvidence(entry: TimelineEntry, index: number, ref?: TimelineRef): DailyEvidenceItem {
  return {
    id: `${entry.event_id}:${index}`,
    kind: sourceKindForRef(ref?.kind),
    ref: ref?.ref,
    title: ref?.label ?? entry.title,
    summary: entry.summary,
    excerpt: clip([entry.title, entry.summary].filter(Boolean).join('\n'), 800),
    occurred_at: entry.occurred_at,
    local_date: localDateKey(entry.occurred_at),
    local_time: localTimeLabel(entry.occurred_at),
    event_id: entry.event_id,
    event_kind: entry.event_kind,
    refs: entry.refs
  };
}

function sourceFromEvidence(item: DailyEvidenceItem): SynthesisSource {
  return {
    kind: item.kind === 'scheduled_task' ? 'task' : item.kind,
    ref: item.ref ?? item.id,
    title: item.title,
    excerpt: item.excerpt,
    metadata: {
      evidence_id: item.id,
      event_id: item.event_id,
      event_kind: item.event_kind,
      occurred_at: item.occurred_at,
      local_date: item.local_date,
      local_time: item.local_time,
      summary: item.summary,
      refs: item.refs
    }
  };
}

function sourceKindForRef(kind: TimelineRef['kind'] | undefined): SynthesisSourceKind {
  if (kind === 'note' || kind === 'library' || kind === 'project' || kind === 'area' || kind === 'resource' || kind === 'task' || kind === 'conversation' || kind === 'kb') return kind;
  return 'event';
}

function annotationsText(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .slice(-8)
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const record = item as Record<string, unknown>;
      return [record['text'], record['comment']].filter((part): part is string => typeof part === 'string').join(' - ');
    })
    .filter(Boolean)
    .join('\n');
}

function clip(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function localDateKey(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})T/);
    return match?.[1] ?? value.slice(0, 10);
  }
  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    String(parsed.getDate()).padStart(2, '0')
  ].join('-');
}

function localTimeLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const match = value.match(/T(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : value.slice(11, 16);
  }
  return parsed.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}
