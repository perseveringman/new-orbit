import type { SynthesisArtifact } from '../synthesis';

export const INDEXABLE_ENTITY_KINDS = [
  'note',
  'library_item',
  'resource',
  'project',
  'area',
  'conversation',
  'synthesis_artifact',
  'kb_doc'
] as const;

export type IndexableEntityKind = (typeof INDEXABLE_ENTITY_KINDS)[number];

export type SemanticLayer = 1 | 2;
export type SearchMatchMode = 'semantic' | 'keyword' | 'hybrid';
export type SearchMatchType = 'semantic' | 'keyword' | 'both';
export type SearchLayerLabel = 'truth' | 'synthesis' | 'feed-only';

export interface SemanticDocument {
  id: string;
  entity_kind: IndexableEntityKind;
  entity_ref: string;
  title: string;
  content: string;
  tags?: string[];
  areas?: string[];
  resource_refs?: string[];
  layer: SemanticLayer;
  layer_label: SearchLayerLabel;
  updated_at: string;
  removed?: boolean;
}

export interface EmbeddingRecord {
  doc_id: string;
  model: string;
  dimensions: number;
  vector_file: string;
  content_hash: string;
  embedded_at: string;
}

export interface SearchResult {
  doc: SemanticDocument;
  score: number;
  match_type: SearchMatchType;
  snippets?: string[];
  entity_label: string;
  entity_url?: string;
  why?: string;
}

export interface SearchQuery {
  text: string;
  entity_kinds?: IndexableEntityKind[];
  layers?: SemanticLayer[];
  areas?: string[];
  resources?: string[];
  date_from?: string;
  date_to?: string;
  match_mode: SearchMatchMode;
  top_k?: number;
  min_score?: number;
}

export interface SearchSession {
  id: string;
  query: SearchQuery;
  results: SearchResult[];
  artifact_id?: string;
  created_at: string;
}

export interface SemanticIndexStatus {
  total_docs: number;
  indexed_docs: number;
  stale_docs: number;
  last_indexed_at?: string;
  embedding_model: string;
  embedding_dimensions: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  session?: SearchSession;
}

export interface SearchAnswerResponse extends SearchResponse {
  answer?: SynthesisArtifact;
}

export interface SemanticIndexFile {
  version: 1;
  docs: Record<string, { content_hash: string; embedded_at?: string; removed?: boolean; stale?: boolean }>;
  last_indexed_at?: string;
  embedding_model: string;
  embedding_dimensions: number;
}

export function isIndexableEntityKind(value: string): value is IndexableEntityKind {
  return (INDEXABLE_ENTITY_KINDS as readonly string[]).includes(value);
}

export function normalizeSearchQuery(input: SearchQuery): SearchQuery {
  const text = input.text.trim();
  const matchMode = input.match_mode ?? 'hybrid';
  if (!['semantic', 'keyword', 'hybrid'].includes(matchMode)) {
    throw new Error(`invalid_search_match_mode:${String(matchMode)}`);
  }
  const topK = Math.min(100, Math.max(1, input.top_k ?? 20));
  const minScore = input.min_score === undefined ? 0 : Math.min(1, Math.max(0, input.min_score));
  return {
    ...input,
    text,
    match_mode: matchMode,
    top_k: topK,
    min_score: minScore,
    entity_kinds: input.entity_kinds?.filter(isIndexableEntityKind),
    layers: input.layers?.filter((layer): layer is SemanticLayer => layer === 1 || layer === 2),
    areas: input.areas?.map((area) => area.trim()).filter(Boolean),
    resources: input.resources?.map((resource) => resource.trim()).filter(Boolean)
  };
}
