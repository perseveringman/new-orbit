import type {
  ContextPacketScope,
  ContextRetrievalComplexity,
  ContextRetrievalIntent,
  ContextRetrievalRoute,
  ContextRetrievalStep,
  ContextRetrievalSufficiency,
  ContextRetrievalTrace
} from '@shared/context';
import type { EvidenceChunkSearchResult } from '@shared/evidence';

export interface RetrievalPlanInput {
  query?: string;
  scope: ContextPacketScope;
}

export interface RetrievalPlan {
  intent: ContextRetrievalIntent;
  complexity: ContextRetrievalComplexity;
  needsRetrieval: boolean;
  routes: ContextRetrievalRoute[];
  queries: string[];
  steps: ContextRetrievalStep[];
}

export function planContextRetrieval(input: RetrievalPlanInput): RetrievalPlan {
  const query = normalizeWhitespace(input.query ?? '');
  const lower = query.toLowerCase();
  const mentionsExternalSession = /外部\s*ai\s*会话|external\s+ai\s+session|claude|codex|amp/u.test(lower);
  const asksTemporalCount = /多少|几条|数量|count|统计|5月|五月|6月|六月|\b20\d{2}[-/]\d{1,2}\b/u.test(lower);
  const asksGlobalSensemaking = /总结|整体|全局|主题|趋势|主要|复盘|归纳|脉络|global|theme|trend|summari[sz]e/u.test(lower);
  const asksMultiHop = /为什么|原因|关系|关联|影响|对比|取舍|如何|怎么|\bhow\b|\bwhy\b|multi-hop|compare|relationship|improve/u.test(lower);
  const tokenCount = tokenizeQuery(query).length;

  const intent: ContextRetrievalIntent = mentionsExternalSession
    ? 'external_session'
    : asksTemporalCount
      ? 'temporal_count'
      : asksGlobalSensemaking
        ? 'global_sensemaking'
        : asksMultiHop || tokenCount >= 8
          ? 'multi_hop'
          : query
            ? 'specific_lookup'
            : 'direct';
  const complexity: ContextRetrievalComplexity =
    intent === 'global_sensemaking' || intent === 'multi_hop'
      ? 'high'
      : intent === 'external_session' || intent === 'temporal_count'
        ? 'medium'
        : 'low';
  const needsRetrieval = Boolean(query) && intent !== 'direct';
  const routes = routesForIntent(intent, input.scope);
  const queries = buildQueryVariants(query, intent);

  return {
    intent,
    complexity,
    needsRetrieval,
    routes,
    queries,
    steps: [
      {
        id: 'route',
        kind: 'route',
        status: 'executed',
        reason: `intent=${intent}; complexity=${complexity}; routes=${routes.join(', ')}`
      },
      ...queries.slice(1).map((variant, index) => ({
        id: `rewrite-${index + 1}`,
        kind: 'query_rewrite' as const,
        status: 'planned' as const,
        query: variant,
        reason: 'deterministic query variant for broader evidence recall'
      }))
    ]
  };
}

export function gradeEvidenceResults(results: EvidenceChunkSearchResult[], plan: RetrievalPlan): ContextRetrievalSufficiency {
  if (!plan.needsRetrieval) {
    return { status: 'enough', score: 1, reasons: ['No retrieval needed for this query.'] };
  }
  if (!results.length) {
    return { status: 'missing', score: 0, reasons: ['No evidence chunks matched the retrieval plan.'] };
  }
  const uniqueSources = new Set(results.map((result) => result.chunk.source_id));
  const topScore = Math.max(...results.map((result) => result.score), 0);
  const hybridHits = results.filter((result) => result.match_type === 'hybrid').length;
  const sourceCoverage = Math.min(1, uniqueSources.size / (plan.complexity === 'high' ? 4 : 2));
  const depthCoverage = Math.min(1, results.length / (plan.complexity === 'high' ? 6 : 3));
  const hybridCoverage = Math.min(1, hybridHits / 2);
  const score = Number((topScore * 0.45 + sourceCoverage * 0.25 + depthCoverage * 0.2 + hybridCoverage * 0.1).toFixed(4));
  const status: ContextRetrievalSufficiency = {
    status: score >= 0.55 ? 'enough' : score >= 0.25 ? 'thin' : 'missing',
    score,
    reasons: [
      `${results.length} evidence chunk(s)`,
      `${uniqueSources.size} source(s)`,
      `top score ${topScore.toFixed(2)}`,
      `${hybridHits} hybrid match(es)`
    ]
  };
  if (plan.complexity === 'high' && uniqueSources.size < 3) {
    status.reasons.push('High-complexity query may need more source diversity.');
  }
  return status;
}

export function buildRetrievalTrace(
  plan: RetrievalPlan,
  resultCount: number,
  sufficiency: ContextRetrievalSufficiency,
  options: { graphExpanded?: boolean } = {}
): ContextRetrievalTrace {
  const searchSteps: ContextRetrievalStep[] = plan.queries.map((query, index) => ({
    id: `hybrid-search-${index + 1}`,
    kind: 'hybrid_search',
    status: plan.needsRetrieval ? 'executed' : 'skipped',
    query,
    reason: index === 0 ? 'primary user query' : 'query variant',
    result_count: index === 0 ? resultCount : undefined
  }));
  const graphStep: ContextRetrievalStep = {
    id: 'graph-expand',
    kind: 'graph_expand',
    status: options.graphExpanded ? 'executed' : 'skipped',
    reason: options.graphExpanded ? 'expanded top evidence entities into graph neighbors' : 'no graph expansion candidates'
  };
  const gradeStep: ContextRetrievalStep = {
    id: 'evidence-grade',
    kind: 'evidence_grade',
    status: 'executed',
    reason: `sufficiency=${sufficiency.status}; score=${sufficiency.score}`,
    result_count: resultCount,
    notes: sufficiency.reasons.join('; ')
  };
  return {
    intent: plan.intent,
    complexity: plan.complexity,
    needs_retrieval: plan.needsRetrieval,
    routes: plan.routes,
    queries: plan.queries,
    steps: [...plan.steps, ...searchSteps, graphStep, gradeStep],
    sufficiency
  };
}

export function renderRetrievalTraceSection(trace: ContextRetrievalTrace): string {
  const lines = [
    `Intent: ${trace.intent}`,
    `Complexity: ${trace.complexity}`,
    `Needs retrieval: ${trace.needs_retrieval ? 'yes' : 'no'}`,
    `Routes: ${trace.routes.join(', ') || 'none'}`,
    `Queries: ${trace.queries.join(' | ') || 'none'}`,
    `Evidence sufficiency: ${trace.sufficiency.status} (${trace.sufficiency.score})`,
    `Reasons: ${trace.sufficiency.reasons.join('; ')}`
  ];
  return lines.join('\n');
}

export function renderAnswerGuidance(trace: ContextRetrievalTrace): string {
  const guidance = [
    '把这段当作内部回答约束，不要逐字复述给用户。',
    '先用用户的语言直接回答问题，再补充必要依据和边界。',
    '不要展开内部检索实现细节，除非用户明确问架构。'
  ];

  if (trace.intent === 'external_session' || trace.intent === 'temporal_count') {
    guidance.push('如果问题在问外部 AI 会话或数量统计，优先给明确数字、日期范围和口径；区分“总发现”和“当前索引”。');
    guidance.push('如果证据不足，不要猜数；说明当前能确认的范围，并告诉用户还缺哪类数据。');
  } else if (trace.intent === 'global_sensemaking') {
    guidance.push('如果问题在问整体趋势或总结，按主题归纳，避免把单条证据夸大成全局结论。');
  } else if (trace.intent === 'multi_hop') {
    guidance.push('如果问题需要推理，先给结论，再用 2-4 个证据点解释原因、关系或取舍。');
  } else if (trace.intent === 'specific_lookup') {
    guidance.push('如果问题是查找型，保持短、准、可核验；只回答用户问到的范围。');
  }

  if (trace.sufficiency.status === 'missing') {
    guidance.push('当前没有足够证据支撑答案。应明确说“我现在没找到足够证据”，再给一个可执行的下一步。');
  } else if (trace.sufficiency.status === 'thin') {
    guidance.push('当前证据偏薄。可以给初步判断，但必须标明这是基于有限证据，不要写成确定事实。');
  }

  return guidance.join('\n');
}

function routesForIntent(intent: ContextRetrievalIntent, scope: ContextPacketScope): ContextRetrievalRoute[] {
  const routes: ContextRetrievalRoute[] = ['evidence_chunks', 'semantic_index'];
  if (scope.kind !== 'global') routes.push('synthesis');
  if (intent === 'external_session') routes.push('external_ai_sessions', 'synthesis');
  if (intent === 'multi_hop' || intent === 'global_sensemaking') routes.push('graph_neighbors', 'memories', 'synthesis');
  if (intent === 'temporal_count') routes.push('external_ai_sessions', 'memories');
  return Array.from(new Set(routes));
}

function buildQueryVariants(query: string, intent: ContextRetrievalIntent): string[] {
  if (!query) return [];
  const variants = new Set<string>([query]);
  const compact = query.replace(/[?!？！，,。；;:：]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  if (compact && compact !== query) variants.add(compact);
  if (intent === 'external_session' || intent === 'temporal_count') {
    variants.add(`${compact} 外部 AI 会话 Claude Codex Amp`);
    variants.add(`${compact} external AI session local history`);
  }
  if (intent === 'global_sensemaking') {
    variants.add(`${compact} 主题 趋势 总结 复盘`);
  }
  if (intent === 'multi_hop') {
    variants.add(`${compact} 关系 关联 原因 决策`);
  }
  return Array.from(variants).slice(0, 4);
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .normalize('NFKC')
    .split(/[^a-z0-9\u4e00-\u9fff._:-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}
