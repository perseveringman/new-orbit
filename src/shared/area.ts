import type { FeedSource } from './feed';
import type { LibraryItem } from './library';
import type { Note } from './note';
import type { ResourceSummary } from './resource';
import type { ScheduledTask } from './scheduled-task';
import type { TaskRecord } from './schemas';
import type { SynthesisArtifact } from './synthesis';

export const AREA_STATUSES = ['active', 'dormant', 'archived'] as const;
export type AreaStatus = (typeof AREA_STATUSES)[number];

export interface AreaConfig {
  uid: string;
  slug: string;
  name: string;
  description?: string;
  status: AreaStatus;
  template?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  vision_refs?: string[];
}

export interface AreaRef {
  area_slug: string;
  primary?: boolean;
  assigned_at: string;
  assigned_by: 'user' | 'synthesis';
}

export type AreaAssignableEntityKind =
  | 'note'
  | 'library_item'
  | 'resource'
  | 'project'
  | 'task'
  | 'feed_source'
  | 'scheduled_task'
  | 'conversation';

export interface AreaEntityRef {
  kind: AreaAssignableEntityKind;
  id: string;
  title?: string;
}

export interface AreaStats {
  active_projects: number;
  open_tasks: number;
  resources: number;
  recent_notes: number;
  library_items: number;
  feed_sources: number;
  scheduled_reviews: number;
  unassigned_candidates: number;
}

export interface AreaHealth {
  score: number;
  state: 'healthy' | 'watch' | 'stale';
  reasons: string[];
}

export interface AreaDashboardData {
  area: AreaConfig;
  health: AreaHealth;
  active_projects: Array<{
    uid: string;
    slug: string;
    name: string;
    status: string;
    relPath: string;
    task_count?: number;
  }>;
  resources: ResourceSummary[];
  recent_notes: Note[];
  library_items: LibraryItem[];
  feed_sources: FeedSource[];
  scheduled_reviews: ScheduledTask[];
  open_tasks: TaskRecord[];
  stats: AreaStats;
  synthesis?: SynthesisArtifact | null;
  unassigned_queue: AreaEntityRef[];
}

export interface AreaAssignmentSuggestion {
  entity: AreaEntityRef;
  area_slug: string;
  confidence: number;
  reason: string;
  primary?: boolean;
  synthesis_ref?: string;
}

export interface AreaAssignmentInput {
  entity: AreaEntityRef;
  area: AreaRef;
}

export interface AreaUnassignmentInput {
  entity: AreaEntityRef;
  area_slug: string;
}

export interface AreaChangeEvent {
  type: 'created' | 'updated' | 'archived' | 'assignment_added' | 'assignment_removed';
  area?: AreaConfig;
  entity?: AreaEntityRef;
}
