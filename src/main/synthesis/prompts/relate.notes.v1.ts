import type { NoteRelationSuggestion } from '@shared/note';
import { parseJsonResponse, type SynthesisPromptTemplate } from './registry';

export const relateNotesPrompt: SynthesisPromptTemplate<{ relations: NoteRelationSuggestion[] }> = {
  kind: 'relate.notes',
  version: 'relate.notes.v1',
  defaultBudget: { input_tokens: 6000, output_tokens: 1400, usd: 0.08 },
  render(input) {
    return {
      system: [
        'You suggest semantic relations between Orbit Notes.',
        'Return strict JSON only with a relations array.',
        'Relations are proposals; do not write backlinks or frontmatter.'
      ].join('\n'),
      user: `Find note relations:\n${JSON.stringify(input, null, 2)}`
    };
  },
  parse(response): { relations: NoteRelationSuggestion[] } {
    const parsed = parseJsonResponse(response) as Record<string, unknown>;
    return {
      relations: Array.isArray(parsed['relations']) ? (parsed['relations'] as NoteRelationSuggestion[]) : []
    };
  }
};
