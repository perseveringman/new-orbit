import type { LibraryDistillPayload } from '@shared/synthesis';
import { parseJsonResponse, stringArray, type SynthesisPromptTemplate } from './registry';

export const distillLibraryPrompt: SynthesisPromptTemplate<LibraryDistillPayload> = {
  kind: 'distill.library',
  version: 'distill.library.v1',
  defaultBudget: { input_tokens: 8000, output_tokens: 1200, usd: 0.12 },
  render(input) {
    return {
      system: [
        'You distill a saved Library item into an artifact.',
        'Return strict JSON only with: title, summary, key_points, quotes, suggested_note_type.',
        'Do not create a Note. This is only a Layer 2 artifact.'
      ].join('\n'),
      user: `Distill this Library item:\n${JSON.stringify(input, null, 2)}`
    };
  },
  parse(response): LibraryDistillPayload {
    const parsed = parseJsonResponse(response) as Record<string, unknown>;
    const title = typeof parsed['title'] === 'string' ? parsed['title'] : '';
    const summary = typeof parsed['summary'] === 'string' ? parsed['summary'] : '';
    if (!title || !summary) throw new Error('distill_library_malformed_output');
    const noteType = parsed['suggested_note_type'] === 'longform' ? 'longform' : 'capture';
    return {
      title,
      summary,
      key_points: stringArray(parsed['key_points']),
      quotes: stringArray(parsed['quotes']),
      suggested_note_type: noteType
    };
  }
};

