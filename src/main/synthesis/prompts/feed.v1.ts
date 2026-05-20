import type {
  FeedCluster,
  FeedClusterPayload,
  FeedDigestHighlight,
  FeedDigestPayload,
  FeedItemAnalysisPayload,
  FeedRecommendation,
  FeedRecommendationKind,
  FeedRelatedRef,
  FeedReportPayload,
  FeedReportSection,
  FeedTriageLabel
} from '@shared/feed';
import { parseJsonResponse, stringArray, type SynthesisPromptTemplate } from './registry';

const RECOMMENDATION_KINDS: FeedRecommendationKind[] = [
  'read_now',
  'save_to_library',
  'save_to_library_with_resource',
  'ignore',
  'watch',
  'create_task',
  'save_report_as_note'
];

const TRIAGE_LABELS: FeedTriageLabel[] = ['read_now', 'save', 'skim', 'watch', 'ignore'];

const feedSystem = [
  '你是 Orbit 的个人信号分拣引擎。',
  '目标不是写新闻摘要，而是帮用户从低信号 Feed 中判断哪些内容值得进入 Library、Resource、Task 或 Watch。',
  '必须遵守分层：FeedItem 是 Layer 0 信号；你的输出是 Layer 2 建议；不要自动保存、不要声称已经修改用户资料库。',
  '必须使用中文。只基于输入 sources 中的标题、摘要、来源元数据和摘录判断；证据不足时降低 confidence。',
  '评分使用 0 到 1：relevance_score 表示对用户已配置 Area/Resource/source tags 的相关性；novelty_score 表示相对同批内容的新意；confidence 表示证据充分度。',
  'Return strict JSON only. No markdown, no code fences.'
].join('\n');

export const feedItemAnalysisPrompt: SynthesisPromptTemplate<FeedItemAnalysisPayload> = {
  kind: 'feed.item.analysis',
  version: 'feed.item.analysis.v1',
  defaultBudget: { input_tokens: 7000, output_tokens: 1200, usd: 0.12 },
  render(input) {
    return {
      system: [
        feedSystem,
        'Schema: { item_id, summary, why_it_matters, triage_label, relevance_score, novelty_score, confidence, key_points, key_claims, entities, related, suggested_actions, action_candidates, risks }.',
        'triage_label 只能是 read_now/save/skim/watch/ignore。',
        'related 是 { kind: "area"|"resource", ref, title?, confidence, reason }[]。',
        'action_candidates 是 { kind, label, reason, item_ids?, resource_ref?, area_ref?, confidence? }[]。'
      ].join('\n'),
      user: `请为这个 Feed 条目生成个人信号分拣结果：\n${JSON.stringify(input, null, 2)}`
    };
  },
  parse(response): FeedItemAnalysisPayload {
    const parsed = parseJsonResponse(response) as Record<string, unknown>;
    const itemId = text(parsed['item_id']) || sourceRef(parsed);
    const summary = text(parsed['summary']);
    if (!itemId || !summary) throw new Error('feed_item_analysis_malformed_output');
    return {
      item_id: itemId,
      summary,
      key_points: stringArray(parsed['key_points']),
      key_claims: stringArray(parsed['key_claims']),
      entities: stringArray(parsed['entities']),
      why_it_matters: text(parsed['why_it_matters']) || undefined,
      triage_label: triageLabel(parsed['triage_label']),
      relevance_score: score(parsed['relevance_score']),
      novelty_score: score(parsed['novelty_score']),
      confidence: score(parsed['confidence']),
      related: relatedRefs(parsed['related']),
      suggested_actions: stringArray(parsed['suggested_actions']),
      action_candidates: recommendations(parsed['action_candidates']),
      risks: stringArray(parsed['risks'])
    };
  }
};

export const feedDigestPrompt: SynthesisPromptTemplate<FeedDigestPayload> = {
  kind: 'feed.digest',
  version: 'feed.digest.v1',
  defaultBudget: { input_tokens: 12000, output_tokens: 1400, usd: 0.16 },
  render(input) {
    return {
      system: [
        feedSystem,
        '生成今日 Feed 分拣摘要。只挑真正值得用户处理的信号，不要机械罗列所有条目。',
        'Schema: { date, item_count, headline, highlights, recommendations }.',
        'highlights 是 { item_id, source_id, title, url, published_at?, summary?, why_it_matters?, relevance_score?, novelty_score?, suggested_action? }[]。'
      ].join('\n'),
      user: `请生成今日 Feed 分拣摘要：\n${JSON.stringify(input, null, 2)}`
    };
  },
  parse(response): FeedDigestPayload {
    const parsed = parseJsonResponse(response) as Record<string, unknown>;
    const headline = text(parsed['headline']);
    if (!headline) throw new Error('feed_digest_malformed_output');
    return {
      date: text(parsed['date']),
      item_count: integer(parsed['item_count']) ?? 0,
      headline,
      highlights: digestHighlights(parsed['highlights']),
      recommendations: recommendations(parsed['recommendations'])
    };
  }
};

export const feedClusterPrompt: SynthesisPromptTemplate<FeedClusterPayload> = {
  kind: 'feed.cluster',
  version: 'feed.cluster.v1',
  defaultBudget: { input_tokens: 12000, output_tokens: 1600, usd: 0.18 },
  render(input) {
    return {
      system: [
        feedSystem,
        '把 Feed 条目聚成对用户有意义的主题，不要只按来源分组。',
        'Schema: { scope, clusters }.',
        'clusters 是 { label, item_ids, source_ids?, rationale, key_claims?, relevance_score?, novelty_score?, related?, suggested_actions? }[]。'
      ].join('\n'),
      user: `请聚类这些 Feed 信号：\n${JSON.stringify(input, null, 2)}`
    };
  },
  parse(response): FeedClusterPayload {
    const parsed = parseJsonResponse(response) as Record<string, unknown>;
    return {
      scope: text(parsed['scope']),
      clusters: clusters(parsed['clusters'])
    };
  }
};

export const feedDailyReportPrompt: SynthesisPromptTemplate<FeedReportPayload> = {
  kind: 'feed.report.daily',
  version: 'feed.report.daily.v1',
  defaultBudget: { input_tokens: 14000, output_tokens: 1800, usd: 0.2 },
  render(input) {
    return {
      system: [
        feedSystem,
        '生成“今天什么变了/什么值得处理”的 Feed 报告。',
        '不要写泛泛总结；优先识别重复主张、异常信号、和用户长期方向/Resource 的关系。',
        'Schema: { date, item_count, digest_artifact_id?, cluster_artifact_id?, headline, executive_summary, sections, recommendations }.',
        'sections 是 { title, item_ids, summary, key_changes?, repeated_claims?, why_it_matters?, recommended_item_ids? }[]。'
      ].join('\n'),
      user: `请生成今日 Feed 信号报告：\n${JSON.stringify(input, null, 2)}`
    };
  },
  parse(response): FeedReportPayload {
    const parsed = parseJsonResponse(response) as Record<string, unknown>;
    const headline = text(parsed['headline']);
    const executiveSummary = text(parsed['executive_summary']);
    if (!headline && !executiveSummary) throw new Error('feed_report_daily_malformed_output');
    return {
      date: text(parsed['date']),
      item_count: integer(parsed['item_count']) ?? 0,
      digest_artifact_id: text(parsed['digest_artifact_id']) || undefined,
      cluster_artifact_id: text(parsed['cluster_artifact_id']) || undefined,
      headline: headline || undefined,
      executive_summary: executiveSummary || undefined,
      sections: reportSections(parsed['sections']),
      recommendations: recommendations(parsed['recommendations'])
    };
  }
};

function digestHighlights(value: unknown): FeedDigestHighlight[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const itemId = text(record['item_id']);
    const sourceId = text(record['source_id']);
    const title = text(record['title']);
    const url = text(record['url']);
    if (!itemId || !sourceId || !title || !url) return [];
    return [
      {
        item_id: itemId,
        source_id: sourceId,
        title,
        url,
        published_at: text(record['published_at']) || undefined,
        summary: text(record['summary']) || undefined,
        why_it_matters: text(record['why_it_matters']) || undefined,
        relevance_score: score(record['relevance_score']),
        novelty_score: score(record['novelty_score']),
        suggested_action: recommendationKind(record['suggested_action'])
      }
    ];
  });
}

function clusters(value: unknown): FeedCluster[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const label = text(record['label']);
    const itemIds = stringArray(record['item_ids']);
    if (!label || itemIds.length === 0) return [];
    return [
      {
        label,
        item_ids: itemIds,
        source_ids: stringArray(record['source_ids']),
        rationale: text(record['rationale']),
        key_claims: stringArray(record['key_claims']),
        relevance_score: score(record['relevance_score']),
        novelty_score: score(record['novelty_score']),
        related: relatedRefs(record['related']),
        suggested_actions: recommendations(record['suggested_actions'])
      }
    ];
  });
}

function reportSections(value: unknown): FeedReportSection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const title = text(record['title']);
    const itemIds = stringArray(record['item_ids']);
    const summary = text(record['summary']);
    if (!title || !summary) return [];
    return [
      {
        title,
        item_ids: itemIds,
        summary,
        key_changes: stringArray(record['key_changes']),
        repeated_claims: stringArray(record['repeated_claims']),
        why_it_matters: text(record['why_it_matters']) || undefined,
        recommended_item_ids: stringArray(record['recommended_item_ids'])
      }
    ];
  });
}

function relatedRefs(value: unknown): FeedRelatedRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const kind = record['kind'] === 'area' || record['kind'] === 'resource' ? record['kind'] : null;
    const ref = text(record['ref']);
    const reason = text(record['reason']);
    if (!kind || !ref || !reason) return [];
    return [
      {
        kind,
        ref,
        title: text(record['title']) || undefined,
        confidence: score(record['confidence']) ?? 0.5,
        reason
      }
    ];
  });
}

function recommendations(value: unknown): FeedRecommendation[] {
  if (!Array.isArray(value)) return [];
  const output: FeedRecommendation[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      output.push({ kind: 'watch', label: item, reason: item });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const kind = recommendationKind(record['kind']) ?? 'watch';
    const label = text(record['label']);
    const reason = text(record['reason']);
    if (!label || !reason) continue;
    output.push({
      kind,
      label,
      reason,
      item_ids: stringArray(record['item_ids']),
      resource_ref: text(record['resource_ref']) || undefined,
      area_ref: text(record['area_ref']) || undefined,
      confidence: score(record['confidence'])
    });
  }
  return output;
}

function triageLabel(value: unknown): FeedTriageLabel | undefined {
  return typeof value === 'string' && TRIAGE_LABELS.includes(value as FeedTriageLabel)
    ? (value as FeedTriageLabel)
    : undefined;
}

function recommendationKind(value: unknown): FeedRecommendationKind | undefined {
  return typeof value === 'string' && RECOMMENDATION_KINDS.includes(value as FeedRecommendationKind)
    ? (value as FeedRecommendationKind)
    : undefined;
}

function score(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, value));
}

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sourceRef(parsed: Record<string, unknown>): string {
  const sources = parsed['sources'];
  if (!Array.isArray(sources)) return '';
  const first = sources[0] as { ref?: unknown } | undefined;
  return text(first?.ref);
}
