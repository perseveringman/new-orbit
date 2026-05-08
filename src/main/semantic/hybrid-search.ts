import type { SearchQuery, SearchResult, SemanticDocument } from '@shared/semantic';
import { normalizeSearchQuery } from '@shared/semantic';
import { cosineSimilarity, embedText, tokenize } from './embedder';
import type { IndexedSemanticDocument } from './index-store';

interface ScoredDoc {
  indexed: IndexedSemanticDocument;
  semantic: number;
  keyword: number;
}

export async function hybridSearch(indexedDocs: IndexedSemanticDocument[], query: SearchQuery): Promise<SearchResult[]> {
  const normalized = normalizeSearchQuery(query);
  const filtered = indexedDocs.filter((item) => matchesFilters(item.doc, normalized));
  const queryTokens = tokenize(normalized.text);
  if (!normalized.text && !queryTokens.length) {
    return filtered
      .sort((a, b) => b.doc.updated_at.localeCompare(a.doc.updated_at))
      .slice(0, normalized.top_k)
      .map((indexed) => toResult({ indexed, semantic: 0, keyword: 0 }, 'keyword', 0));
  }

  const queryVector = normalized.match_mode === 'keyword' ? null : (await embedText(normalized.text)).vector;
  const scored = filtered
    .map<ScoredDoc>((indexed) => ({
      indexed,
      semantic: queryVector ? Math.max(0, cosineSimilarity(queryVector, indexed.vector)) : 0,
      keyword: keywordScore(indexed.doc, queryTokens)
    }))
    .map((scoredDoc) => ({ scoredDoc, score: combinedScore(scoredDoc, normalized.match_mode) }))
    .filter((item) => item.score >= (normalized.min_score ?? 0))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.scoredDoc.indexed.doc.updated_at.localeCompare(a.scoredDoc.indexed.doc.updated_at);
    })
    .slice(0, normalized.top_k);

  return scored.map(({ scoredDoc, score }) => toResult(scoredDoc, matchType(scoredDoc), score, queryTokens));
}

function matchesFilters(doc: SemanticDocument, query: SearchQuery): boolean {
  if (query.entity_kinds?.length && !query.entity_kinds.includes(doc.entity_kind)) return false;
  if (query.layers?.length && !query.layers.includes(doc.layer)) return false;
  if (query.areas?.length && !query.areas.some((area) => doc.areas?.includes(area))) return false;
  if (query.resources?.length && !query.resources.some((resource) => doc.resource_refs?.includes(resource))) return false;
  if (query.date_from && doc.updated_at < query.date_from) return false;
  if (query.date_to && doc.updated_at > query.date_to) return false;
  return true;
}

function keywordScore(doc: SemanticDocument, queryTokens: string[]): number {
  if (!queryTokens.length) return 0;
  const docTokens = new Set(tokenize([doc.title, doc.tags?.join(' '), doc.content].filter(Boolean).join(' ')));
  let matches = 0;
  for (const token of queryTokens) if (docTokens.has(token)) matches += 1;
  const phraseBoost = doc.content.toLowerCase().includes(queryTokens.join(' ')) || doc.title.toLowerCase().includes(queryTokens.join(' ')) ? 0.2 : 0;
  return Math.min(1, matches / queryTokens.length + phraseBoost);
}

function combinedScore(doc: ScoredDoc, mode: SearchQuery['match_mode']): number {
  if (mode === 'semantic') return doc.semantic;
  if (mode === 'keyword') return doc.keyword;
  return doc.semantic * 0.55 + doc.keyword * 0.45;
}

function matchType(doc: ScoredDoc): SearchResult['match_type'] {
  if (doc.semantic > 0.05 && doc.keyword > 0) return 'both';
  if (doc.semantic > doc.keyword) return 'semantic';
  return 'keyword';
}

function toResult(scored: ScoredDoc, type: SearchResult['match_type'], score: number, tokens: string[] = []): SearchResult {
  const doc = scored.indexed.doc;
  return {
    doc,
    score: Number(score.toFixed(4)),
    match_type: type,
    entity_label: entityLabel(doc),
    entity_url: entityUrl(doc),
    snippets: buildSnippets(doc, tokens),
    why: why(scored)
  };
}

function buildSnippets(doc: SemanticDocument, tokens: string[]): string[] {
  if (!doc.content) return [];
  const lower = doc.content.toLowerCase();
  const token = tokens.find((item) => lower.includes(item));
  const start = token ? Math.max(0, lower.indexOf(token) - 80) : 0;
  return [doc.content.slice(start, start + 220).trim()];
}

function entityLabel(doc: SemanticDocument): string {
  const layer = doc.layer_label === 'synthesis' ? 'Layer 2' : 'Layer 1';
  return `${doc.entity_kind.replace(/_/g, ' ')} · ${layer}`;
}

function entityUrl(doc: SemanticDocument): string | undefined {
  if (doc.entity_kind === 'note') return `orbit://note/${doc.entity_ref}`;
  if (doc.entity_kind === 'library_item') return `orbit://library/${doc.entity_ref}`;
  if (doc.entity_kind === 'resource') return `orbit://resource/${doc.entity_ref}`;
  if (doc.entity_kind === 'project') return `orbit://project/${doc.entity_ref}`;
  if (doc.entity_kind === 'area') return `orbit://area/${doc.entity_ref}`;
  if (doc.entity_kind === 'conversation') return `orbit://conversation/${doc.entity_ref}`;
  if (doc.entity_kind === 'synthesis_artifact') return `orbit://synthesis/${doc.entity_ref}`;
  return undefined;
}

function why(scored: ScoredDoc): string {
  const parts = [];
  if (scored.keyword > 0) parts.push(`keyword ${scored.keyword.toFixed(2)}`);
  if (scored.semantic > 0) parts.push(`semantic ${scored.semantic.toFixed(2)}`);
  return parts.join(' + ') || 'recent result';
}
