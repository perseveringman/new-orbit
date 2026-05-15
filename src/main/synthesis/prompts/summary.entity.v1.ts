import type { NoteWorkbenchPayload } from '@shared/note';
import { parseJsonResponse, type SynthesisPromptTemplate, stringArray } from './registry';

export const summaryEntityPrompt: SynthesisPromptTemplate<NoteWorkbenchPayload> = {
  kind: 'summary.entity',
  version: 'summary.entity.v1',
  defaultBudget: { input_tokens: 5000, output_tokens: 1600, usd: 0.08 },
  render(input) {
    return {
      system: [
        'You summarize an Orbit Layer 1 entity and propose safe next actions.',
        'Return strict JSON only with summary, key_points, suggested_tags, suggestions, and relations.',
        'Do not mutate Notes, Resources, Areas, or Tasks. This is only a Layer 2 artifact.'
      ].join('\n'),
      user: `Summarize this Orbit entity:\n${JSON.stringify(input, null, 2)}`
    };
  },
  parse(response): NoteWorkbenchPayload {
    const parsed = parseJsonResponse(response) as Record<string, unknown>;
    return {
      summary: typeof parsed['summary'] === 'string' ? parsed['summary'] : '',
      key_points: stringArray(parsed['key_points']),
      suggested_tags: stringArray(parsed['suggested_tags']),
      suggestions: Array.isArray(parsed['suggestions']) ? (parsed['suggestions'] as NoteWorkbenchPayload['suggestions']) : [],
      relations: Array.isArray(parsed['relations']) ? (parsed['relations'] as NoteWorkbenchPayload['relations']) : []
    };
  }
};
