export const RESOURCE_STATUSES = ['active', 'dormant', 'evolved', 'archived'] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export const RESOURCE_DEPTHS = ['exploring', 'practicing', 'mastered', 'teaching'] as const;
export type ResourceDepth = (typeof RESOURCE_DEPTHS)[number];

export const RESOURCE_SECTIONS = ['canonical', 'distilled', 'related', 'people', 'projects_touched'] as const;
export type ResourceSection = (typeof RESOURCE_SECTIONS)[number];

export const RESOURCE_REF_KINDS = [
  'note',
  'library_item',
  'feed_source',
  'kb_item',
  'project',
  'area',
  'person',
  'url'
] as const;
export type ResourceRefKind = (typeof RESOURCE_REF_KINDS)[number];

export interface ResourceFrontmatter {
  id: string;
  type: 'resource';
  title: string;
  slug: string;
  status: ResourceStatus;
  depth: ResourceDepth;
  created: string;
  updated: string;
  last_engaged?: string;
  engagement_count: number;
  tags: string[];
  evolved_to?: string;
}

export interface ResourceRef {
  id: string;
  kind: ResourceRefKind;
  ref: string;
  title?: string;
  summary?: string;
  section: ResourceSection;
  added_at: string;
  source?: 'manual' | 'suggestion' | 'ask_anywhere' | 'system';
}

export interface ResourceCounts {
  canonical: number;
  distilled: number;
  related: number;
  people: number;
  projects_touched: number;
  timeline: number;
}

export interface ResourceSummary {
  frontmatter: ResourceFrontmatter;
  path: string;
  counts: ResourceCounts;
}

export interface Resource extends ResourceSummary {
  body: string;
  refs: ResourceRef[];
  timeline: ResourceTimelineEntry[];
}

export interface ResourceTimelineEntry {
  id: string;
  at: string;
  kind: 'created' | 'linked' | 'engaged' | 'updated' | 'archived';
  title: string;
  summary?: string;
  ref_id?: string;
}

export interface ResourceFilter {
  status?: ResourceStatus;
  tag?: string;
  include_archived?: boolean;
}

export interface CreateResourceInput {
  title: string;
  slug?: string;
  body?: string;
  tags?: string[];
  depth?: ResourceDepth;
}

export interface UpdateResourceInput {
  title?: string;
  body?: string;
  status?: ResourceStatus;
  depth?: ResourceDepth;
  tags?: string[];
  evolved_to?: string;
}

export interface LinkResourceRefInput {
  kind: ResourceRefKind;
  ref: string;
  title?: string;
  summary?: string;
  section?: ResourceSection;
  source?: ResourceRef['source'];
}

export interface ResourceEngagementInput {
  title?: string;
  summary?: string;
  ref_id?: string;
}

export interface ResourceEngagement {
  resource: Resource;
  entry: ResourceTimelineEntry;
}

export interface ResourceSuggestionOptions {
  minNotes?: number;
  limit?: number;
}

export interface ResourceSuggestion {
  topic: string;
  tag: string;
  note_count: number;
  sample_notes: Array<{
    id: string;
    title?: string;
    path: string;
    excerpt: string;
  }>;
  confidence: number;
  synthesis_ref?: string;
}

export interface CreateResourceFromSuggestionInput {
  suggestion: ResourceSuggestion;
  title?: string;
}

export interface ResourceChangeEvent {
  type: 'created' | 'updated' | 'archived' | 'linked' | 'unlinked' | 'engaged';
  resource: Resource;
}
