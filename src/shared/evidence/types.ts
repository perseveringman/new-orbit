export const EVIDENCE_SOURCE_KINDS = [
  'note',
  'library_item',
  'resource',
  'project',
  'area',
  'task',
  'conversation',
  'activity_event',
  'external_ai_session',
  'external_file',
  'kb_doc'
] as const;

export const EVIDENCE_OWNERSHIPS = ['orbit_owned', 'reference', 'snapshot'] as const;

export const EVIDENCE_AVAILABILITIES = [
  'available',
  'changed',
  'missing',
  'permission_denied',
  'snapshotted'
] as const;

export const EVIDENCE_SELECTOR_KINDS = [
  'whole_source',
  'message_range',
  'event_range',
  'line_range',
  'time_range',
  'semantic_chunk'
] as const;

export const EVIDENCE_CONTENT_VIEWS = ['metadata', 'safe_projection', 'full'] as const;

export type EvidenceSourceKind = (typeof EVIDENCE_SOURCE_KINDS)[number];
export type EvidenceOwnership = (typeof EVIDENCE_OWNERSHIPS)[number];
export type EvidenceAvailability = (typeof EVIDENCE_AVAILABILITIES)[number];
export type EvidenceSelectorKind = (typeof EVIDENCE_SELECTOR_KINDS)[number];
export type EvidenceContentView = (typeof EVIDENCE_CONTENT_VIEWS)[number];

export interface EvidenceScopeRef {
  kind: 'project' | 'area' | 'resource' | 'task' | 'note' | 'library';
  ref: string;
  confidence?: number;
}

export interface EvidenceFingerprint {
  algorithm: 'sha256' | 'mtime-size' | 'provider-version';
  value: string;
  size_bytes?: number;
  mtime?: string;
}

export interface EvidencePrivacy {
  index_level: 'metadata_only' | 'safe_projection' | 'full_text';
  allow_synthesis: boolean;
  allow_tool_outputs: boolean;
  redaction_profile?: 'default' | 'code' | 'strict';
}

export interface ExternalAISessionRootConfig {
  agent: string;
  dir: string;
  source?: string;
  enabled?: boolean;
}

export interface ExternalAISessionSettings {
  enabled: boolean;
  limit: number;
  roots: ExternalAISessionRootConfig[];
  includeAgents: string[];
  excludeAgents: string[];
  includeProjects: string[];
  excludeProjects: string[];
  includePathSubstrings: string[];
  excludePathSubstrings: string[];
  indexLevel: EvidencePrivacy['index_level'];
  includeToolOutputs: boolean;
  updated_at?: string;
}

export interface EvidenceSource {
  id: string;
  kind: EvidenceSourceKind;
  ownership: EvidenceOwnership;
  title: string;
  summary?: string;
  provider_id: string;
  canonical_ref: string;
  created_at?: string;
  updated_at: string;
  observed_at: string;
  time_range?: { from?: string; to?: string };
  scope_refs?: EvidenceScopeRef[];
  fingerprint: EvidenceFingerprint;
  availability: EvidenceAvailability;
  privacy: EvidencePrivacy;
  snapshot_ref?: string;
  metadata?: Record<string, unknown>;
}

export interface EvidenceSelector {
  source_id: string;
  kind: EvidenceSelectorKind;
  range?: {
    from?: string | number;
    to?: string | number;
  };
  role_filter?: Array<'user' | 'assistant' | 'system' | 'tool'>;
  content_view: EvidenceContentView;
  reason?: string;
}

export interface EvidenceExcerpt {
  selector: EvidenceSelector;
  text: string;
  title?: string;
  source?: EvidenceSource;
  redacted?: boolean;
  metadata?: Record<string, unknown>;
}

export interface EvidenceReadResult {
  source: EvidenceSource;
  excerpts: EvidenceExcerpt[];
  availability: EvidenceAvailability;
}

export interface EvidenceChunk {
  id: string;
  source_id: string;
  selector: EvidenceSelector;
  title: string;
  text: string;
  ordinal: number;
  content_hash: string;
  updated_at: string;
  tokens: string[];
  entities: string[];
  scope_refs?: EvidenceScopeRef[];
  metadata?: Record<string, unknown>;
}

export interface EvidenceChunkSearchResult {
  chunk: EvidenceChunk;
  source?: EvidenceSource;
  score: number;
  why: string;
}

export interface EvidenceChunkFilter {
  source_id?: string;
  scope?: EvidenceScopeRef;
  entity?: string;
  query?: string;
  limit?: number;
}

export interface EvidenceChunkIndexFile {
  version: 1;
  chunks: Record<string, EvidenceChunk>;
  source_fingerprints: Record<string, string>;
  updated_at?: string;
}

export interface SourceListInput {
  since?: string;
  until?: string;
  scope_refs?: EvidenceScopeRef[];
  limit?: number;
  include_unavailable?: boolean;
}

export interface ProviderSearchInput {
  query: string;
  limit?: number;
  content_view?: EvidenceContentView;
}

export interface SnapshotOptions {
  reason?: string;
  content_view?: EvidenceContentView;
}

export interface EvidenceSnapshot {
  source_id: string;
  snapshot_ref: string;
  created_at: string;
  fingerprint: EvidenceFingerprint;
}

export interface SourceProvider {
  id: string;
  kind: EvidenceSourceKind;
  kinds?: readonly EvidenceSourceKind[];
  list(input?: SourceListInput): Promise<EvidenceSource[]>;
  get(sourceId: string): Promise<EvidenceSource | null>;
  read(selector: EvidenceSelector): Promise<EvidenceReadResult>;
  search?(input: ProviderSearchInput): Promise<EvidenceSelector[]>;
  fingerprint(source: EvidenceSource): Promise<EvidenceFingerprint>;
  snapshot?(sourceId: string, options?: SnapshotOptions): Promise<EvidenceSnapshot>;
}

export interface EvidenceSourceFilter {
  kind?: EvidenceSourceKind;
  provider_id?: string;
  availability?: EvidenceAvailability;
  ownership?: EvidenceOwnership;
  scope?: EvidenceScopeRef;
  query?: string;
  include_unavailable?: boolean;
  limit?: number;
}

export interface EvidenceRegistryFile {
  version: 1;
  sources: Record<string, EvidenceSource>;
  updated_at?: string;
}

export function isEvidenceSourceKind(value: string): value is EvidenceSourceKind {
  return (EVIDENCE_SOURCE_KINDS as readonly string[]).includes(value);
}

export function evidenceSourceId(kind: EvidenceSourceKind, ref: string): string {
  const normalized = ref.trim().replace(/\s+/g, ' ');
  const safe = normalized
    .replace(/[^a-zA-Z0-9_.:-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96);
  return `evidence:${kind}:${safe || 'source'}:${hashString(normalized)}`;
}

export function wholeSourceSelector(
  sourceId: string,
  contentView: EvidenceContentView = 'safe_projection',
  reason?: string
): EvidenceSelector {
  return {
    source_id: sourceId,
    kind: 'whole_source',
    content_view: contentView,
    ...(reason ? { reason } : {})
  };
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
