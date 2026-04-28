import type { ResourceEmergencePayload } from '@shared/synthesis';
import { parseJsonResponse, type SynthesisPromptTemplate } from './registry';

export const emergeResourcePrompt: SynthesisPromptTemplate<ResourceEmergencePayload> = {
  kind: 'emerge.resource',
  version: 'emerge.resource.v1',
  defaultBudget: { input_tokens: 6000, output_tokens: 1600, usd: 0.12 },
  render(input) {
    return {
      system: [
        'You suggest Resource workstations from Layer 1 Notes/Library signals.',
        'Return strict JSON only with a suggestions array.',
        'Do not create Resources. Resource creation requires user acceptance.'
      ].join('\n'),
      user: `Find emerging Resource topics:\n${JSON.stringify(input, null, 2)}`
    };
  },
  parse(response): ResourceEmergencePayload {
    const parsed = parseJsonResponse(response) as Record<string, unknown>;
    const suggestions = Array.isArray(parsed['suggestions']) ? parsed['suggestions'] : [];
    return { suggestions: suggestions as ResourceEmergencePayload['suggestions'] };
  }
};

