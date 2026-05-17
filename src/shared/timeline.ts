export interface TimelineRef {
  kind: 'note' | 'library' | 'project' | 'area' | 'resource' | 'task' | 'conversation' | 'kb' | 'export';
  ref: string;
  label?: string;
}

export interface TimelineEntry {
  event_id: string;
  event_kind: string;
  trace_id?: string;
  occurred_at: string;
  layer: 1 | 2;
  icon: string;
  title: string;
  summary?: string;
  refs?: TimelineRef[];
  aggregation_key?: string;
  derived_from?: string[];
}

export interface DailyStats {
  total_events: number;
  thoughts_count: number;
  longforms_wrote: number;
  longforms_words: number;
  library_added: number;
  library_read: number;
  tasks_completed: number;
  projects_touched: string[];
  areas_touched: string[];
  resources_touched: string[];
  conversations_count: number;
}

export interface DailySummary {
  generated_at: string;
  note_path: string;
  headline: string;
  narrative: string;
  highlights?: string[];
  synthesis_ref?: string;
  status?: 'fresh' | 'stale' | 'superseded' | 'failed';
  source_count?: number;
  runtime?: string;
  model?: string;
  prompt_version?: string;
}

export interface DailyTimeline {
  date: string;
  entries: TimelineEntry[];
  segments?: TimeSegmentGroup[];
  stats: DailyStats;
  summary?: DailySummary;
}

export type TimeSegmentId = 'night' | 'morning' | 'noon' | 'afternoon' | 'evening';

export interface TimeSegmentGroup {
  id: TimeSegmentId;
  label: string;
  range: string;
  entries: TimelineEntry[];
}

export interface WeeklyTimeline {
  iso_week: string;
  range: { from: string; to: string };
  days: DailyTimeline[];
  stats: DailyStats;
}

export interface MonthlyIndex {
  month: string;
  days: Array<{
    date: string;
    entry_count: number;
    highlight_kinds: string[];
    summary_headline?: string;
  }>;
}

export interface YearlyIndex {
  year: number;
  months: Array<{
    month: string;
    total_events: number;
    days_active: number;
  }>;
}

export interface TimelineScope {
  kind: 'day' | 'week' | 'month' | 'year';
  value: string;
}

export interface TimelineExportResult {
  path: string;
  format: 'pdf';
  scope: TimelineScope;
}

export const TIMELINE_LAYER_1_KINDS = new Set([
  'note.created',
  'note.updated',
  'note.archived',
  'library.item.added',
  'library.item.annotated',
  'library.item.status_changed',
  'library.item.read',
  'library.item.distilled',
  'library.item.linked_to_resource',
  'feed.source.added',
  'feed.item.saved_to_library',
  'daily_summary.generated',
  'kb.imported',
  'kb.doc.activated',
  'kb.activated',
  'kb.welcome_analysis_completed',
  'scheduled_task.created',
  'scheduled_task.execution.completed',
  'task.completed',
  'conversation.started',
  'conversation.meaningful',
  'resource.created',
  'resource.updated',
  'resource.ref.linked',
  'resource.ref.promoted',
  'resource.engagement',
  'resource.archived'
]);

export const TIMELINE_LAYER_2_KINDS = new Set([
  'agent.run.started',
  'agent.run.completed',
  'agent.run.interrupted',
  'runtime.sdk.invocation.started',
  'runtime.sdk.cost',
  'runtime.sdk.invocation.completed',
  'synthesis.artifact.created',
  'synthesis.artifact.stale',
  'synthesis.artifact.superseded',
  'synthesis.artifact.failed',
  'synthesis.artifact.user_edited',
  'conversation.turn.added',
  'conversation.message.added',
  'inbox.item.created',
  'inbox.item.resolved',
  'activity.user',
  'activity.system'
]);

export function shouldShowOnTimeline(eventKind: string | undefined, developerMode = false): boolean {
  if (!eventKind) return false;
  if (TIMELINE_LAYER_1_KINDS.has(eventKind)) return true;
  if (developerMode && TIMELINE_LAYER_2_KINDS.has(eventKind)) return true;
  return false;
}
