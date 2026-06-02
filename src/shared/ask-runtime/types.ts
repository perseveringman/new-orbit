export const ASK_INTENT_ROUTES = [
  'direct_answer',
  'vault_qa',
  'connector_inventory',
  'research_workflow',
  'agent_action'
] as const;

export type AskIntentRoute = (typeof ASK_INTENT_ROUTES)[number];

export const ASK_CONTEXT_LANES = ['fast', 'retrieval', 'slow'] as const;

export type AskContextLane = (typeof ASK_CONTEXT_LANES)[number];

export const ASK_RUN_PHASES = [
  'accepted',
  'routing',
  'context',
  'runtime_selection',
  'model_stream',
  'tool_runtime',
  'synthesis',
  'completed'
] as const;

export type AskRunPhase = (typeof ASK_RUN_PHASES)[number];

export type AskRuntimeStatus = 'started' | 'completed' | 'skipped' | 'failed' | 'attached';

export type AskIntentDecisionSource =
  | 'explicit'
  | 'slash_command'
  | 'llm'
  | 'rules'
  | 'heuristic'
  | 'fallback';

export interface AskIntentAlternative {
  route: AskIntentRoute;
  confidence: number;
  reason: string;
}

export interface AskIntentDecision {
  route: AskIntentRoute;
  confidence: number;
  source: AskIntentDecisionSource;
  reason: string;
  alternatives: AskIntentAlternative[];
  needsRetrieval: boolean;
  allowsSlowEnrichment: boolean;
}

export function askIntentRouteLabel(route: AskIntentRoute): string {
  switch (route) {
    case 'direct_answer':
      return '直接回答';
    case 'vault_qa':
      return '本地知识问答';
    case 'connector_inventory':
      return '连接器盘点';
    case 'research_workflow':
      return '外部调研';
    case 'agent_action':
      return '执行动作';
  }
}

export function askContextLaneLabel(lane: AskContextLane): string {
  switch (lane) {
    case 'fast':
      return '快速上下文';
    case 'retrieval':
      return '检索上下文';
    case 'slow':
      return '后台补充';
  }
}
