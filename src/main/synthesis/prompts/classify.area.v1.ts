import type { AreaClassificationPayload } from '@shared/synthesis';
import { parseJsonResponse, type SynthesisPromptTemplate } from './registry';

export const classifyAreaPrompt: SynthesisPromptTemplate<AreaClassificationPayload> = {
  kind: 'classify.area',
  version: 'classify.area.v1',
  defaultBudget: { input_tokens: 4000, output_tokens: 800, usd: 0.06 },
  render(input) {
    return {
      system: [
        'You suggest Area assignments for an Orbit entity.',
        'Return strict JSON only with a suggestions array.',
        'Do not mutate the entity; this is a Layer 2 suggestion artifact.'
      ].join('\n'),
      user: `Classify this entity into Areas:\n${JSON.stringify(input, null, 2)}`
    };
  },
  parse(response): AreaClassificationPayload {
    const parsed = parseJsonResponse(response) as Record<string, unknown>;
    const suggestions = Array.isArray(parsed['suggestions']) ? parsed['suggestions'] : [];
    return { suggestions: suggestions as AreaClassificationPayload['suggestions'] };
  }
};

