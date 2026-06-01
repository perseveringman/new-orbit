import type { SearchResult } from '@shared/semantic';
import type { SynthesisPromptTemplate } from './registry';
import { parseJsonResponse } from './registry';

interface SearchAnswerPromptInput {
  scope_key: string;
  sources: Array<{
    ref?: string;
    title?: string;
    excerpt?: string;
    metadata?: Record<string, unknown>;
  }>;
}

export interface SearchAnswerPayload {
  answer: string;
  citations: Array<{ doc_id: string; title: string }>;
  confidence: number;
}

export const searchAnswerPrompt: SynthesisPromptTemplate<SearchAnswerPayload> = {
  kind: 'search.answer',
  version: 'search.answer.v1',
  defaultBudget: { input_tokens: 6000, output_tokens: 700, usd: 0.08 },
  render(input: unknown) {
    const typed = input as SearchAnswerPromptInput;
    const docs = typed.sources
      .map((source, index) => {
        const result = source.metadata?.['result'] as SearchResult | undefined;
        const layer = result?.doc.layer_label ?? 'unknown';
        return `${index + 1}. [${source.ref ?? 'doc'} | ${layer}] ${source.title ?? 'Untitled'}\n${source.excerpt ?? ''}`;
      })
      .join('\n\n');
    return {
      system:
        [
          'You answer questions over Orbit search results.',
          'Give the user a useful answer first, in the same language as the user.',
          'Do not expose internal implementation terms such as ContextPacket, retrieval plan, FTS, vector score, hybrid search, or sufficiency labels unless the user asks about architecture.',
          'If the provided documents are insufficient, say what can and cannot be confirmed instead of guessing.',
          'Cite only the provided documents. Do not write to Layer 1 Truth.'
        ].join(' '),
      user: `Search scope: ${typed.scope_key}\n\nDocuments:\n${docs}\n\nReturn JSON: {"answer": string, "citations": [{"doc_id": string, "title": string}], "confidence": number between 0 and 1}.`
    };
  },
  parse(response: unknown): SearchAnswerPayload {
    const parsed = parseJsonResponse(response) as Partial<SearchAnswerPayload>;
    return {
      answer: typeof parsed.answer === 'string' ? parsed.answer : 'No answer was generated.',
      citations: Array.isArray(parsed.citations)
        ? parsed.citations
            .filter((item): item is { doc_id: string; title: string } =>
              Boolean(item && typeof item.doc_id === 'string' && typeof item.title === 'string')
            )
            .slice(0, 8)
        : [],
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0
    };
  }
};
