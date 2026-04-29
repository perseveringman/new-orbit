import type { SearchAnswerResponse, SearchQuery, SearchResult } from '@shared/semantic';
import type { SynthesisSource } from '@shared/synthesis';
import { createSynthesisJob, SynthesisRunner, type SynthesisRuntimeRouter } from '../synthesis/runner';
import { createSynthesisStore } from '../synthesis/store';
import { createSemanticIndexStore } from './index-store';

export async function searchAndAnswer(
  vaultPath: string,
  query: SearchQuery,
  options: { router?: SynthesisRuntimeRouter | null; maxBudgetUsd?: number } = {}
): Promise<SearchAnswerResponse> {
  const index = createSemanticIndexStore(vaultPath);
  const { results, total } = await index.search(query);
  const limitedResults = results.slice(0, Math.min(8, query.top_k ?? 8));
  const scopeKey = searchAnswerScopeKey(query, limitedResults);
  const store = createSynthesisStore(vaultPath);
  const runner = new SynthesisRunner(store, options);
  const artifact = await runner.run(
    createSynthesisJob({
      kind: 'search.answer',
      scope_key: scopeKey,
      sources: limitedResults.map(resultToSource),
      priority: 'interactive',
      reason: 'manual',
      force: true
    })
  );
  return { results, total, answer: artifact };
}

export function searchAnswerScopeKey(query: SearchQuery, results: SearchResult[]): string {
  const docIds = results.map((result) => result.doc.id).join(',');
  return `search.answer:${Buffer.from(JSON.stringify({ text: query.text, mode: query.match_mode, docIds })).toString('base64url')}`;
}

function resultToSource(result: SearchResult): SynthesisSource {
  return {
    kind: sourceKind(result.doc.entity_kind),
    ref: result.doc.id,
    title: result.doc.title,
    excerpt: result.snippets?.[0] ?? result.doc.content.slice(0, 500),
    weight: result.score,
    metadata: { result }
  };
}

function sourceKind(kind: SearchResult['doc']['entity_kind']): SynthesisSource['kind'] {
  if (kind === 'library_item') return 'library';
  if (kind === 'synthesis_artifact') return 'raw';
  if (kind === 'kb_doc') return 'kb';
  return kind;
}
