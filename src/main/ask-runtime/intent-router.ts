import type { ConversationScope } from '@shared/conversation';
import {
  askIntentRouteLabel,
  type AskIntentAlternative,
  type AskIntentDecision,
  type AskIntentDecisionSource,
  type AskIntentRoute
} from '@shared/ask-runtime';

export interface AskIntentInput {
  text: string;
  scope: ConversationScope;
  skillRefs?: string[];
  conversationContext?: AskIntentConversationContext;
}

export interface AskIntentConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AskIntentConversationContext {
  recentTurns: AskIntentConversationTurn[];
}

interface RouteScore {
  route: AskIntentRoute;
  score: number;
  reason: string;
}

const ROUTE_ORDER: AskIntentRoute[] = [
  'agent_action',
  'connector_inventory',
  'research_workflow',
  'vault_qa',
  'direct_answer'
];

export function routeAskIntent(input: AskIntentInput): AskIntentDecision {
  const text = input.text.trim();
  const normalized = normalizeText(text);
  const explicit = explicitRoute(normalized);
  if (explicit)
    return decision(explicit.route, explicit.confidence, explicit.source, explicit.reason);

  const scores = scoreRoutes(
    normalized,
    input.scope,
    input.skillRefs ?? [],
    input.conversationContext
  );
  const ranked = scores.sort(
    (left, right) =>
      right.score - left.score || ROUTE_ORDER.indexOf(left.route) - ROUTE_ORDER.indexOf(right.route)
  );
  const winner = ranked[0] ?? {
    route: 'direct_answer' as const,
    score: 0.45,
    reason: '没有命中本地知识、连接器、外部调研或执行动作信号，先走轻量直答。'
  };
  const confidence = clamp(winner.score, 0.35, 0.96);
  const source: AskIntentDecisionSource = confidence >= 0.72 ? 'rules' : 'heuristic';
  return decision(
    winner.route,
    confidence,
    source,
    winner.reason,
    ranked
      .filter((item) => item.route !== winner.route && item.score > 0.34)
      .slice(0, 3)
      .map(
        (item): AskIntentAlternative => ({
          route: item.route,
          confidence: clamp(item.score, 0.25, 0.86),
          reason: item.reason
        })
      )
  );
}

export function shouldEscalateDirectToVault(input: {
  decision: AskIntentDecision;
  evidenceCount: number;
  text: string;
}): boolean {
  if (input.decision.route !== 'direct_answer') return false;
  if (input.evidenceCount <= 0) return false;
  const text = normalizeText(input.text);
  return hasAny(text, ['我的', '最近', '之前', '笔记', '项目', '任务', '资源', 'vault', 'orbit']);
}

function explicitRoute(
  text: string
): {
  route: AskIntentRoute;
  confidence: number;
  source: AskIntentDecisionSource;
  reason: string;
} | null {
  if (/^\/(?:model|endpoint)\b/i.test(text)) {
    return {
      route: 'direct_answer',
      confidence: 0.99,
      source: 'slash_command',
      reason: '这是随处问运行时命令，不需要进入重上下文链路。'
    };
  }
  const routeMatch = /^\/ask-route\s+(direct|vault|connector|research|action)\b/i.exec(text);
  if (routeMatch?.[1]) {
    const map: Record<string, AskIntentRoute> = {
      direct: 'direct_answer',
      vault: 'vault_qa',
      connector: 'connector_inventory',
      research: 'research_workflow',
      action: 'agent_action'
    };
    const route = map[routeMatch[1].toLowerCase()];
    if (route) {
      return {
        route,
        confidence: 0.99,
        source: 'explicit',
        reason: `用户显式指定路由为 ${askIntentRouteLabel(route)}。`
      };
    }
  }
  return null;
}

function scoreRoutes(
  text: string,
  scope: ConversationScope,
  skillRefs: string[],
  conversationContext?: AskIntentConversationContext
): RouteScore[] {
  const scores: RouteScore[] = [];
  const followUp = isContextDependentFollowup(text);
  const recentContext = followUp ? normalizeText(renderRecentContext(conversationContext)) : '';
  const contextualText = recentContext ? `${text}\n${recentContext}` : text;

  const actionHits = countHits(text, [
    '创建',
    '新增',
    '修改',
    '更新',
    '整理成任务',
    '提议任务',
    '安排',
    '归档',
    '保存',
    '执行',
    '运行',
    '跑一下',
    '接受建议',
    '加入',
    '写入'
  ]);
  const asksForListing = hasAny(text, ['哪些', '多少', '几个', '列表', '统计', '有没有']);
  if (actionHits > 0 && !asksForListing) {
    scores.push({
      route: 'agent_action',
      score: 0.72 + Math.min(actionHits, 3) * 0.06,
      reason: '用户请求会改变 Orbit 数据或触发工具执行，需要进入动作路由并遵守审批边界。'
    });
  }

  if (isConnectorInventoryQuery(contextualText)) {
    scores.push({
      route: 'connector_inventory',
      score: 0.9,
      reason: '问题同时命中连接器/本地 AI 会话与数量、月份或最新等盘点信号。'
    });
  }

  const researchHits = countHits(contextualText, [
    '调研',
    '网上',
    '网络',
    'web',
    'internet',
    '搜索',
    '论文',
    'sota',
    '最新',
    '新闻',
    '价格',
    '政策',
    '法规',
    '官方文档',
    'benchmark',
    '对比业界'
  ]);
  if (researchHits > 0 && !hasAny(text, ['我的笔记', '我的项目', '我的任务', 'vault'])) {
    scores.push({
      route: 'research_workflow',
      score: 0.66 + Math.min(researchHits, 4) * 0.06,
      reason: '问题需要外部或时效性信息，不能只依赖本地 vault。'
    });
  }

  const vaultHits = countHits(contextualText, [
    '我的',
    '笔记',
    '项目',
    '任务',
    '资源',
    'area',
    'resource',
    'library',
    'vault',
    '知识库',
    '之前',
    '最近',
    '刚才',
    '创建了哪些',
    '有哪些',
    'todo',
    'inbox',
    'pmil',
    '证据',
    '上下文',
    'context',
    'memory'
  ]);
  if (vaultHits > 0 || scope.kind !== 'global') {
    scores.push({
      route: 'vault_qa',
      score: 0.58 + Math.min(vaultHits, 5) * 0.06 + (scope.kind !== 'global' ? 0.14 : 0),
      reason:
        scope.kind !== 'global'
          ? '当前会话带有 Orbit 空间锚点，优先读取本地上下文。'
          : '问题指向用户自己的笔记、项目、任务或知识库，需要本地证据。'
    });
  }

  const directScore = shortDirectQuestion(text) ? 0.72 : 0.46;
  scores.push({
    route: 'direct_answer',
    score: directScore + (skillRefs.length > 0 ? 0.08 : 0),
    reason:
      skillRefs.length > 0
        ? '用户选择了技能，先让技能提示和轻量上下文接管。'
        : '问题看起来可以直接回答，不需要先阻塞在重检索链路。'
  });

  return dedupeScores(scores);
}

function isContextDependentFollowup(text: string): boolean {
  if (text.length <= 48 && hasAny(text, ['这个', '那个', '它', '刚才', '上面', '前面', '继续']))
    return true;
  if (/^(那|所以|继续|展开|按你说的|照这个)/u.test(text)) return true;
  if (/(合理吗|对吗|提成任务|变成任务|下一步|第二点|第三点)/u.test(text)) return true;
  return false;
}

function renderRecentContext(context?: AskIntentConversationContext): string {
  if (!context?.recentTurns.length) return '';
  return context.recentTurns
    .slice(-6)
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join('\n');
}

function isConnectorInventoryQuery(text: string): boolean {
  const mentionsConnector =
    hasAny(text, [
      '连接器',
      '外部 ai 会话',
      '外部ai会话',
      '本地 ai 会话',
      '本地ai会话',
      'ai 会话',
      'ai会话',
      'agent 会话',
      'runtime 会话',
      '会话库',
      'local-ai-sessions',
      'session library'
    ]) || /(claude|codex|amp|codebuddy).{0,16}(会话|session)/iu.test(text);
  if (!mentionsConnector) return false;
  return /多少|几个|几条|数量|统计|盘点|月份|月度|最近|最新|新建|创建|count|inventory|month|latest|recent/iu.test(
    text
  );
}

function shortDirectQuestion(text: string): boolean {
  if (text.length <= 24 && /^(你好|hi|hello|谢谢|解释|翻译|总结一下|写一句)/iu.test(text))
    return true;
  if (/^\d+\s*[\+\-\*\/]\s*\d+/.test(text)) return true;
  if (/^(什么是|如何理解|解释一下)/iu.test(text) && text.length < 80) return true;
  return false;
}

function decision(
  route: AskIntentRoute,
  confidence: number,
  source: AskIntentDecisionSource,
  reason: string,
  alternatives: AskIntentAlternative[] = []
): AskIntentDecision {
  const needsRetrieval = route !== 'direct_answer';
  return {
    route,
    confidence,
    source,
    reason,
    alternatives,
    needsRetrieval,
    allowsSlowEnrichment:
      route === 'vault_qa' || route === 'connector_inventory' || route === 'research_workflow'
  };
}

function dedupeScores(scores: RouteScore[]): RouteScore[] {
  const byRoute = new Map<AskIntentRoute, RouteScore>();
  for (const score of scores) {
    const existing = byRoute.get(score.route);
    if (!existing || existing.score < score.score) byRoute.set(score.route, score);
  }
  return [...byRoute.values()];
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function countHits(text: string, keywords: string[]): number {
  return keywords.reduce(
    (count, keyword) => count + (text.includes(keyword.toLowerCase()) ? 1 : 0),
    0
  );
}

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
