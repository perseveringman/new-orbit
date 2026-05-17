import type { DailySummaryEvidenceLine, DailySummaryPayload } from '@shared/synthesis';
import { parseJsonResponse, stringArray, type SynthesisPromptTemplate } from './registry';

export const summaryDailyPrompt: SynthesisPromptTemplate<DailySummaryPayload> = {
  kind: 'summary.daily',
  version: 'summary.daily.v2',
  defaultBudget: { input_tokens: 12_000, output_tokens: 1_600, usd: 0.2 },
  render(input) {
    return {
      system: [
        '你是 Orbit 的每日复盘助手。',
        '你的任务是基于用户当天的真实证据，总结“今天完成、推进、沉淀了什么”。',
        '必须使用中文。不要编造证据中不存在的行动、结论、任务或情绪。',
        '如果证据不足，直接说明“证据不足”，不要用泛泛鼓励补空。',
        '忽略纯技术噪音、模型调用成本、heartbeat、内部 watcher、原始 feed fetch。',
        '所有面向用户的时间必须使用 local_date/local_time 字段；不要直接把 occurred_at 当成本地时间。',
        'Return strict JSON only. No markdown, no code fences.',
        'Schema: { headline, narrative, highlights, done_list, main_threads, open_loops, tomorrow, coverage }.',
        'highlights 是 string[]；done_list/open_loops/tomorrow 是 { text, evidence_ids, reason? }[]；main_threads 是 { title, summary, evidence_ids }[]。',
        '每个 done_list/main_threads/open_loops/tomorrow 条目必须引用 evidence_ids。'
      ].join('\n'),
      user: `请分析这个 Orbit DailyContextPacket，并生成真实每日复盘：\n${JSON.stringify(input, null, 2)}`
    };
  },
  parse(response): DailySummaryPayload {
    const parsed = parseJsonResponse(response) as Record<string, unknown>;
    const headline = typeof parsed['headline'] === 'string' ? parsed['headline'].trim() : '';
    const narrative = typeof parsed['narrative'] === 'string' ? parsed['narrative'].trim() : '';
    if (!headline || !narrative) throw new Error('summary_daily_malformed_output');
    return {
      headline,
      narrative,
      highlights: stringArray(parsed['highlights']),
      done_list: evidenceLines(parsed['done_list']),
      main_threads: mainThreads(parsed['main_threads']),
      open_loops: evidenceLines(parsed['open_loops']),
      tomorrow: evidenceLines(parsed['tomorrow']),
      coverage: coverage(parsed['coverage'])
    };
  }
};

function evidenceLines(value: unknown): DailySummaryEvidenceLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return { text: item.trim(), evidence_ids: [] };
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const text = typeof record['text'] === 'string' ? record['text'].trim() : '';
      if (!text) return null;
      const line: DailySummaryEvidenceLine = {
        text,
        evidence_ids: stringArray(record['evidence_ids'])
      };
      if (typeof record['reason'] === 'string' && record['reason'].trim()) line.reason = record['reason'].trim();
      return line;
    })
    .filter((item): item is DailySummaryEvidenceLine => item !== null);
}

function mainThreads(value: unknown): NonNullable<DailySummaryPayload['main_threads']> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const title = typeof record['title'] === 'string' ? record['title'].trim() : '';
      const summary = typeof record['summary'] === 'string' ? record['summary'].trim() : '';
      if (!title || !summary) return null;
      return { title, summary, evidence_ids: stringArray(record['evidence_ids']) };
    })
    .filter((item): item is NonNullable<DailySummaryPayload['main_threads']>[number] => item !== null);
}

function coverage(value: unknown): DailySummaryPayload['coverage'] {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const evidenceCount = numberValue(record['evidence_count']);
  const omittedCount = numberValue(record['omitted_count']);
  return {
    evidence_count: evidenceCount ?? 0,
    included_kinds: stringArray(record['included_kinds']),
    omitted_count: omittedCount ?? 0
  };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
