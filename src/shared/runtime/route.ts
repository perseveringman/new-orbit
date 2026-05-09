export type RuntimeRouteMode = 'task' | 'ask' | 'synthesis' | 'background';

export type RuntimeRouteTrack = 'cli' | 'sdk' | 'sdk_agent';

export interface RuntimeRouteInput {
  mode: RuntimeRouteMode;
  endpointHint?: string;
  modelHint?: string;
  budgetHintUsd?: number;
  /**
   * 旧字段：表示请求方需要 LLM 调用 tool（仅 CLI 路径能给）。
   * 与 `agentMode` 互斥：agentMode=true 时 SDK 自带 tool 能力，requiresTools 不再强制 CLI。
   */
  requiresTools?: boolean;
  /**
   * Phase A：当 caller 是 Ask-Anywhere agent 模式时设为 true，
   * 路由会在 SDK endpoint 可用时返回 `track: 'sdk_agent'`，否则报错（不 fallback CLI，避免上下文割裂）。
   */
  agentMode?: boolean;
}

export interface RuntimeRouteDecision {
  mode: RuntimeRouteMode;
  track: RuntimeRouteTrack;
  runtime: string;
  endpointId?: string;
  model?: string;
  reason: string;
  fallback?: RuntimeRouteDecision;
}

export function defaultTrackForMode(mode: RuntimeRouteMode): RuntimeRouteTrack {
  return mode === 'task' ? 'cli' : 'sdk';
}

