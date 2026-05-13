/**
 * Agent Tool 共享契约（renderer + main 共用）
 *
 * 设计参考：plans/swift-vortex-darwin.md §2.1
 * Phase A：先满足 SDK adapter / executor / orchestrator 的最小诉求；
 * skill / scope 过滤等元数据保留字段位，Phase C 启用。
 */

import type {
  AuthorityPermission,
  AuthorityRiskLevel,
  AuthorityToolFamily,
} from '@shared/authority';
import type { ConversationScope } from '@shared/conversation';

/** 极简 JSON Schema（Anthropic tools.input_schema 接受标准 JSON Schema 子集）。 */
export type AgentToolJSONSchema = {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
};

/** Tool 与 Activity Log 的对接策略。 */
export interface AgentToolActivityHint {
  /**
   * 如果设置，executor 会在 tool 成功执行后用该 action 写一条 Activity。
   * 不设置则：destructive=true 时落 'agent.tool_invoked' 泛 action（Phase B 引入），
   * destructive=false 时不写 Activity（只走 TraceableEvent）。
   */
  successAction?: string;
  /** 失败时使用的 action，默认 'agent.tool_failed'（Phase B 引入）。 */
  failureAction?: string;
}

/** Agent tool 的元定义。 */
export interface AgentToolDef {
  /** Anthropic tool 名（Snake case，如 orbit_search）。 */
  name: string;
  /** 工作流语义描述：什么时候应该调用，而不是参数细节。 */
  description: string;
  /** JSON Schema for input；同时直接传给 Anthropic tools[].input_schema。 */
  inputSchema: AgentToolJSONSchema;
  /** Bridge 到 CliHandlerRegistry 的方法名（如 'search', 'task.list'）。 */
  cliMethod: string;
  /**
   * 是否会修改 vault 状态。
   * destructive=true 的 tool 会触发 journal 写入与 Activity 留痕（Phase B）。
   */
  destructive?: boolean;
  /** Activity 留痕策略，destructive 才生效。 */
  activity?: AgentToolActivityHint;
  /**
   * 仅在指定的 ConversationScope.kind 下暴露给 LLM；
   * 不设置 = 全 scope 可用。Phase C 启用。
   */
  scopes?: ConversationScope['kind'][];
  /** 单次执行上限，单位 ms。默认 30s，搜索/扫描类放宽到 120s。 */
  timeoutMs?: number;
  /** Agent Authority 工具族，用于审批、白名单与可观测性。 */
  family?: AuthorityToolFamily;
  /** 默认风险等级。具体执行时仍可按参数重新分级。 */
  risk?: AuthorityRiskLevel;
  /** 默认权限集合。具体执行时仍可按参数补充。 */
  permissions?: AuthorityPermission[];
  /** 工具来源，便于对照 OpenClaw 能力矩阵。 */
  source?: 'orbit' | 'openclaw-inspired';
  /** 当前注册状态。未实现的 OpenClaw 对齐项会以 planned 暴露到注册页面。 */
  status?: 'active' | 'planned';
  /** 对应的 OpenClaw tool 名或能力族。 */
  openClawEquivalent?: string;
}

export type AgentToolRegistrationStatus = 'active' | 'planned';

export interface AgentToolRegistrationView {
  name: string;
  description: string;
  family: AuthorityToolFamily;
  risk: AuthorityRiskLevel;
  permissions: AuthorityPermission[];
  scopes: ConversationScope['kind'][];
  status: AgentToolRegistrationStatus;
  source: 'orbit' | 'openclaw-inspired';
  cliMethod?: string;
  destructive?: boolean;
  timeoutMs?: number;
  openClawEquivalent?: string;
}

export interface AgentToolRegistrySnapshot {
  generatedAt: number;
  totalActive: number;
  totalPlanned: number;
  active: AgentToolRegistrationView[];
  planned: AgentToolRegistrationView[];
  openClawParity: {
    implemented: string[];
    planned: string[];
    missing: string[];
  };
}

/** Anthropic 风格的 tool_choice 直通。 */
export type AgentToolChoice =
  | 'auto'
  | 'any'
  | { type: 'tool'; name: string };

/** Agent 主循环每轮的退出原因。 */
export type AgentTurnStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';

/** LLM 在一轮里产生的 tool_use 块（adapter 解析完成后给 orchestrator）。 */
export interface AgentTurnToolUse {
  /** Anthropic 原生 id（toolu_xxx），后续作为 spanId / tool_result.tool_use_id。 */
  id: string;
  name: string;
  input: unknown;
  /**
   * 标记该 tool_use 是 adapter 阶段就解析失败（partial_json 不合法）。
   * 此种情况 input 为 undefined，executor 应当跳过执行直接产出 isError tool_result。
   */
  parseError?: string;
}

/** LLM 在一轮里产生的 assistant content blocks（供下一轮 messages 回灌使用）。 */
export type AgentTurnAssistantBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown };
