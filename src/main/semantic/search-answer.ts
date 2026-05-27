import type { ContextPacket } from '@shared/context';
import type { SearchAnswerResponse, SearchQuery, SearchResult } from '@shared/semantic';
import type { SynthesisSource } from '@shared/synthesis';
import { createSynthesisJob, SynthesisRunner, type SynthesisRuntimeRouter } from '../synthesis/runner';
import { createSynthesisStore } from '../synthesis/store';
import { searchWithContext } from './search-context';

export async function searchAndAnswer(
  vaultPath: string,
  query: SearchQuery,
  options: { router?: SynthesisRuntimeRouter | null; maxBudgetUsd?: number } = {}
): Promise<SearchAnswerResponse> {
  const { results, total, context_packet: contextPacket } = await searchWithContext(vaultPath, query, {
    synthesisMode: 'ensure'
  });
  const limitedResults = results.slice(0, Math.min(8, query.top_k ?? 8));
  const scopeKey = searchAnswerScopeKey(query, limitedResults);
  const store = createSynthesisStore(vaultPath);
  const runner = new SynthesisRunner(store, options);
  const artifact = await runner.run(
    createSynthesisJob({
      kind: 'search.answer',
      scope_key: scopeKey,
      sources: [
        ...limitedResults.map(resultToSource),
        ...contextPacketToSources(contextPacket)
      ],
      priority: 'interactive',
      reason: 'manual',
      force: true
    })
  );
  return { results, total, answer: artifact, ...(contextPacket ? { context_packet: contextPacket } : {}) };
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
  if (kind === 'external_file') return 'raw';
  return kind;
}

function contextPacketToSources(packet: ContextPacket | undefined): SynthesisSource[] {
  if (!packet) return [];
  return packet.sections.slice(0, 5).map((section) => ({
    kind: 'raw',
    ref: `${packet.id}:${section.kind}`,
    title: `Context Packet · ${section.title}`,
    excerpt: section.content,
    weight: 0.65,
    metadata: {
      context_packet_id: packet.id,
      section_kind: section.kind,
      citations: section.citations,
      synthesis_refs: packet.synthesis_refs
    }
  }));
}
