import type { EvidenceSelector } from '@shared/evidence';
import type { PersonalQAPayload } from '@shared/synthesis';
import { parseJsonResponse, stringArray, type SynthesisPromptTemplate } from './registry';

export const personalQAPrompt: SynthesisPromptTemplate<PersonalQAPayload> = {
  kind: 'qa.personal',
  version: 'qa.personal.v1',
  defaultBudget: { input_tokens: 5000, output_tokens: 900, usd: 0.08 },
  render(input) {
    return {
      system: [
        'You generate Orbit Personal QA artifacts as Layer 2 synthesis.',
        'The source of truth is only the provided evidence. Keep citations as selectors when present.',
        'Return strict JSON only.'
      ].join('\n'),
      user: [
        'Create one query-shaped QA artifact for the provided evidence.',
        'Return JSON with: question, answer, confidence, entities, evidence, source_chunk_ids, source_hash, useful_for.',
        `Input:\n${JSON.stringify(input, null, 2)}`
      ].join('\n\n')
    };
  },
  parse(response): PersonalQAPayload {
    const parsed = parseJsonResponse(response) as Record<string, unknown>;
    const question = typeof parsed['question'] === 'string' ? parsed['question'] : 'What do I know from this evidence?';
    const answer = typeof parsed['answer'] === 'string' ? parsed['answer'] : 'No answer was generated.';
    const confidence = typeof parsed['confidence'] === 'number'
      ? Math.max(0, Math.min(1, parsed['confidence']))
      : 0;
    return {
      question,
      answer,
      confidence,
      entities: stringArray(parsed['entities']).slice(0, 24),
      evidence: selectorArray(parsed['evidence']),
      source_chunk_ids: stringArray(parsed['source_chunk_ids']),
      source_hash: typeof parsed['source_hash'] === 'string' ? parsed['source_hash'] : '',
      useful_for: usefulForArray(parsed['useful_for'])
    };
  }
};

function selectorArray(value: unknown): EvidenceSelector[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is EvidenceSelector =>
    Boolean(
      item &&
        typeof item === 'object' &&
        typeof (item as EvidenceSelector).source_id === 'string' &&
        typeof (item as EvidenceSelector).kind === 'string' &&
        typeof (item as EvidenceSelector).content_view === 'string'
    )
  );
}

function usefulForArray(value: unknown): PersonalQAPayload['useful_for'] {
  const allowed = new Set<PersonalQAPayload['useful_for'][number]>([
    'ask',
    'task_context',
    'review',
    'resource',
    'project',
    'area'
  ]);
  const items = stringArray(value).filter((item): item is PersonalQAPayload['useful_for'][number] =>
    allowed.has(item as PersonalQAPayload['useful_for'][number])
  );
  return items.length ? items : ['ask'];
}
