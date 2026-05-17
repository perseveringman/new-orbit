import type { DailySummaryPayload } from '@shared/synthesis';
import { parseJsonResponse, stringArray, type SynthesisPromptTemplate } from './registry';

export const summaryDailyPrompt: SynthesisPromptTemplate<DailySummaryPayload> = {
  kind: 'summary.daily',
  version: 'summary.daily.v1',
  defaultBudget: { input_tokens: 4000, output_tokens: 800, usd: 0.08 },
  render(input) {
    return {
      system: [
        'You generate Orbit Daily Summary artifacts.',
        'Return strict JSON only with: headline, narrative, highlights, tomorrow.',
        'Do not claim actions that are not present in the provided timeline.'
      ].join('\n'),
      user: `Summarize this Orbit day as Layer 2 synthesis. Input:\n${JSON.stringify(input, null, 2)}`
    };
  },
  parse(response): DailySummaryPayload {
    const parsed = parseJsonResponse(response) as Record<string, unknown>;
    const headline = typeof parsed['headline'] === 'string' ? parsed['headline'] : '';
    const narrative = typeof parsed['narrative'] === 'string' ? parsed['narrative'] : '';
    if (!headline || !narrative) throw new Error('summary_daily_malformed_output');
    return {
      headline,
      narrative,
      highlights: stringArray(parsed['highlights']),
      tomorrow: stringArray(parsed['tomorrow']).map((text) => ({ text, evidence_ids: [] }))
    };
  }
};
