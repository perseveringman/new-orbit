import type { EntityProfilePayload } from '@shared/synthesis';
import { parseJsonResponse, stringArray, type SynthesisPromptTemplate } from './registry';

export const entityProfilePrompt: SynthesisPromptTemplate<EntityProfilePayload> = {
  kind: 'entity.profile',
  version: 'entity.profile.v1',
  defaultBudget: { input_tokens: 6000, output_tokens: 1000, usd: 0.04 },
  render(input) {
    return {
      system: [
        'You build entity profiles for a personal memory graph.',
        'Explain what the entity means to the user, which sources support it, and what nearby entities matter.',
        'Return compact JSON only.'
      ].join('\n'),
      user: JSON.stringify(input, null, 2)
    };
  },
  parse(response) {
    const value = parseJsonResponse(response) as Partial<EntityProfilePayload>;
    return {
      entity: String(value.entity ?? ''),
      summary: String(value.summary ?? ''),
      aliases: stringArray(value.aliases),
      related_entities: Array.isArray(value.related_entities) ? value.related_entities as EntityProfilePayload['related_entities'] : [],
      top_sources: Array.isArray(value.top_sources) ? value.top_sources as EntityProfilePayload['top_sources'] : [],
      open_questions: stringArray(value.open_questions),
      evidence: Array.isArray(value.evidence) ? value.evidence as EntityProfilePayload['evidence'] : [],
      source_hash: String(value.source_hash ?? '')
    };
  }
};
