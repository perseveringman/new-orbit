import type { ExternalSessionDistillPayload } from '@shared/synthesis';
import { parseJsonResponse, stringArray, type SynthesisPromptTemplate } from './registry';

export const distillExternalSessionPrompt: SynthesisPromptTemplate<ExternalSessionDistillPayload> = {
  kind: 'distill.external_session',
  version: 'distill.external_session.v1',
  defaultBudget: { input_tokens: 8000, output_tokens: 1200, usd: 0.05 },
  render(input) {
    return {
      system: [
        'You distill local AI agent sessions for a personal knowledge system.',
        'The source session is evidence. Your summary is interpretation and must keep citations available through provided evidence selectors.',
        'Return compact JSON only.'
      ].join('\n'),
      user: JSON.stringify(input, null, 2)
    };
  },
  parse(response) {
    const value = parseJsonResponse(response) as Partial<ExternalSessionDistillPayload>;
    return {
      source_id: String(value.source_id ?? ''),
      title: String(value.title ?? 'Agent session'),
      ...(typeof value.agent === 'string' ? { agent: value.agent } : {}),
      ...(typeof value.project_ref === 'string' ? { project_ref: value.project_ref } : {}),
      ...(value.period && typeof value.period === 'object' ? { period: value.period } : {}),
      summary: String(value.summary ?? ''),
      key_points: stringArray(value.key_points),
      decisions: Array.isArray(value.decisions) ? value.decisions as ExternalSessionDistillPayload['decisions'] : [],
      open_loops: Array.isArray(value.open_loops) ? value.open_loops as ExternalSessionDistillPayload['open_loops'] : [],
      next_actions: stringArray(value.next_actions),
      entities: stringArray(value.entities),
      evidence: Array.isArray(value.evidence) ? value.evidence as ExternalSessionDistillPayload['evidence'] : [],
      source_hash: String(value.source_hash ?? '')
    };
  }
};
