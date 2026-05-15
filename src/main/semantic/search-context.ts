import type { ContextPacketScope } from '@shared/context';
import type { SearchQuery, SearchResponse } from '@shared/semantic';
import { buildContextPacket } from '../context';
import { createSemanticIndexStore } from './index-store';

export interface SearchWithContextOptions {
  synthesisMode?: 'lookup' | 'ensure' | 'off';
}

export async function searchWithContext(
  vaultPath: string,
  query: SearchQuery,
  options: SearchWithContextOptions = {}
): Promise<SearchResponse> {
  const index = createSemanticIndexStore(vaultPath);
  const response = await index.search(query);
  const text = query.text.trim();
  if (!text) return response;

  const contextPacket = await buildContextPacket(vaultPath, {
    purpose: 'ask',
    scope: scopeForSearchQuery(query),
    query: text,
    max_tokens: 1800,
    evidence_limit: 8,
    graph_limit: 10,
    synthesis_mode: options.synthesisMode ?? 'lookup'
  });
  return {
    ...response,
    context_packet: contextPacket
  };
}

function scopeForSearchQuery(query: SearchQuery): ContextPacketScope {
  const resource = query.resources?.find(Boolean);
  if (resource) return { kind: 'resource', ref: resource };
  const area = query.areas?.find(Boolean);
  if (area) return { kind: 'area', ref: area };
  return { kind: 'global' };
}
