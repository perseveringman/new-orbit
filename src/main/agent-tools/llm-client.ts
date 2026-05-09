/**
 * AgentLLMClient — agent 主循环的"单轮 LLM 调用"抽象层。
 *
 * 设计目的（plans/swift-vortex-darwin.md §2.4 / §B12）：
 *   - 把 orchestrator 的 while 循环从 Anthropic SDK 解耦
 *   - 主循环只看到 stream → { text, toolUses, stopReason, usage }
 *   - 单测可以注入 FakeAgentLLMClient 跑出可预测的 tool_use 序列
 *
 * Phase A：实现接口 + Anthropic 实现（在 anthropic-sdk-adapter.ts 同步落地）；
 *          Fake 实现见 fake-llm-client.ts，仅供 tests/* 引用。
 */

import type {
  AgentTurnAssistantBlock,
  AgentTurnStopReason,
  AgentTurnToolUse
} from '@shared/agent-tools';
import type { RuntimeEvent } from '@shared/chat-protocol';
import type { SDKInvocationInput, SDKResolvedInvocation } from '@shared/runtime';

export type AgentRuntimeEventSink = (event: RuntimeEvent) => void | Promise<void>;

/** 一次 LLM 调用的 token 累积。 */
export interface AgentTurnUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** 一次 agent turn 的结构化结果（text + tool_uses 已分离好）。 */
export interface AgentTurnResult {
  /**
   * 该轮 LLM 输出的所有 assistant content blocks（按原始顺序）。
   * orchestrator 直接把它整体作为 messages 中的下一条 assistant.content 回灌。
   */
  assistantBlocks: AgentTurnAssistantBlock[];
  /** assistant text 拼接（仅用于 UI / Conversation.turn.content 的最终落库）。 */
  text: string;
  /** 该轮所有 tool_use 块（包括解析失败的，标记 parseError）。 */
  toolUses: AgentTurnToolUse[];
  /** Anthropic 的 stop_reason。 */
  stopReason: AgentTurnStopReason;
  /** Token 用量（最终聚合）。 */
  usage: AgentTurnUsage;
  /** 该轮发出的所有 RuntimeEvent id（含 message / tool_use / cost / done 等）。 */
  eventIds: string[];
  /** 估算的本轮成本（基于 endpoint costProfile）；无 profile 时省略。 */
  totalUsd?: number;
}

/**
 * AgentLLMClient 抽象：一次"流式 agent turn"。
 *
 * 实现需要：
 *   1. 把 input.tools 透传给 LLM provider；
 *   2. 流式产生 RuntimeEvent（runtime.message / runtime.thinking / runtime.tool_use 等）；
 *   3. tool_use 出现 partial_json 解析失败时，标记 parseError 但不中断 turn；
 *   4. 在 turn 结束时聚合 usage / cost / done 事件。
 */
export interface AgentLLMClient {
  streamAgentTurn(
    invocation: SDKResolvedInvocation,
    input: SDKInvocationInput,
    emit: AgentRuntimeEventSink
  ): Promise<AgentTurnResult>;
}
