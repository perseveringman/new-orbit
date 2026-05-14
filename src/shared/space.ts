import type { AssetPin, AssetScope } from './assets';
import type { TaskRecord } from './schemas';

export const SPACE_TYPES = ['project', 'area', 'resource'] as const;
export type SpaceType = (typeof SPACE_TYPES)[number];

export const SPACE_STATUSES = ['active', 'dormant', 'done', 'archived'] as const;
export type SpaceStatus = (typeof SPACE_STATUSES)[number];

export interface SpaceFrontmatter {
  uid: string;
  slug: string;
  name: string;
  type: SpaceType;
  status: SpaceStatus;
  created_at: string;
  updated_at: string;
  dormant_since?: string;
  deadline?: string;
  archived_at?: string;
  primary_area_uid?: string;
  secondary_area_uids?: string[];
  vision_ref?: string;
  tags: string[];
  execution_context?: 'worktree' | 'direct' | 'sandbox' | 'none';
  workdir?: {
    path: string;
    missing?: boolean;
  };
  git_repo?: string;
  depth_stage?: 'exploring' | 'practicing' | 'mastered' | 'teaching';
  review_cadence?: 'weekly' | 'monthly' | 'quarterly';
}

export interface SpaceSummary {
  space: SpaceFrontmatter;
  path: string;
  relPath: string;
}

export interface SpaceOutputSummary {
  id: string;
  title: string;
  kind?: string;
  status?: string;
  path: string;
  created_at?: string;
  published_at?: string;
  tags?: string[];
}

export interface SpaceContextBundle {
  space: SpaceFrontmatter;
  info: {
    description: string;
    notes: Array<{ title: string; path: string }>;
  };
  tasks: {
    todo: TaskRecord[];
    doing: TaskRecord[];
    awaiting_user: TaskRecord[];
    done_recent: TaskRecord[];
  };
  materials: {
    scopes: AssetScope[];
    pins: AssetPin[];
  };
  outputs: SpaceOutputSummary[];
  recent_conversations: Array<{ id: string; title?: string; updated_at?: string }>;
  linked_from: Array<{
    source_kind: 'library' | 'space' | 'note';
    source_ref: string;
    linked_at: string;
  }>;
  related_spaces: Array<{
    space_uid: string;
    type: SpaceType;
    relation: 'primary_area' | 'secondary_area' | 'inspired_by' | 'distilled_to';
  }>;
}

export interface SpaceContextOptions {
  summary?: boolean;
  sections?: Array<'info' | 'tasks' | 'materials' | 'outputs' | 'conversations' | 'relations'>;
}
