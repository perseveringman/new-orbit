/**
 * runAgentLoop — 纯函数形态的 agent 主循环。
 *
 * 把 orchestrator 里"连续调 LLM、收 tool_use、串行执行 tool、回灌 tool_result"的逻辑
 * 抽离成一个独立可单测的函数：依赖只有 AgentLLMClient + OrbitToolExecutor + emit sink。
 *
 * 不直接依赖 Electron / Anthropic / 文件系统，方便 tests/* 注入 Fake 实现。
 */

import type {
  RuntimeEvent
} from '@shared/chat-protocol';
import type {
  SDKInvocationInput,
  SDKInvocationMessage,
  SDKInvocationMessageContentBlock,
  SDKResolvedInvocation,
  SDKToolDef
} from '@shared/runtime';
import type {
  AgentLLMClient,
  AgentRuntimeEventSink,
  AgentTurnResult
} from './llm-client';
import type { OrbitToolExecutor } from './executor';

export interface AgentLoopInput {
  /** 已解析的 endpoint + key + model（adapter 不再做解析）。 */
  invocation: SDKResolvedInvocation;
  /** 系统提示词（已拼好 Vision + scope + skill 等）。 */
  system: string;
  /** 初始 messages（包含历史 + 当前 user message）。 */
  messages: SDKInvocationMessage[];
  /** Tool 定义集，传给 LLM。 */
  tools: SDKToolDef[];
  conversationId: string;
  runId: string;
  /** 单次 send 的循环上限（默认 25，建议 1-50）。 */
  maxIterations: number;
  mode?: SDKInvocationInput['mode'];
}

export interface AgentLoopResult {
  /** 最终展示给用户的 assistant 文本（最后一轮的 text 拼接）。 */
  text: string;
  /** 全循环累积的 RuntimeEvent ids。 */
  eventIds: string[];
  /** 总迭代次数（实际跑了几轮 LLM）。 */
  iterations: number;
  /** 退出原因。 */
  stopReason: 'end_turn' | 'max_iterations' | 'aborted' | 'tool_use_finalized' | 'other';
  /** 最后一轮 LLM 的 stop_reason 原值（便于诊断）。 */
  lastTurnStopReason?: AgentTurnResult['stopReason'];
}

/**
 * 主循环：直到 LLM 自然 end_turn 或达到迭代上限。
 *
 * 不抛错（除非 client 自身抛 fatal 错误）。tool 执行错误以 isError=true 的 tool_result 回灌给 LLM。
 */
export async function runAgentLoop(
  client: AgentLLMClient,
  executor: OrbitToolExecutor,
  input: AgentLoopInput,
  emit: AgentRuntimeEventSink
): Promise<AgentLoopResult> {
  const aggregatedEventIds: string[] = [];
  const trackingEmit: AgentRuntimeEventSink = async (event: RuntimeEvent) => {
    aggregatedEventIds.push(event.id);
    await emit(event);
  };

  let lastText = '';
  let stopReason: AgentLoopResult['stopReason'] = 'other';
  let lastTurnStopReason: AgentTurnResult['stopReason'] | undefined;
  const messages: SDKInvocationMessage[] = input.messages.slice();
  const maxIter = Math.max(1, Math.min(50, input.maxIterations));

  let turnsRun = 0;
  let iter = 0;
  for (; iter < maxIter; iter += 1) {
    const turn = await client.streamAgentTurn(
      input.invocation,
      {
        endpointId: input.invocation.endpoint.id,
        model: input.invocation.model,
        system: input.system,
        messages,
        tools: input.tools,
        traceId: input.runId,
        conversationId: input.conversationId,
        ...(input.mode ? { mode: input.mode } : {})
      },
      trackingEmit
    );
    turnsRun += 1;
    lastTurnStopReason = turn.stopReason;
    if (turn.text) lastText = turn.text;

    if (turn.stopReason !== 'tool_use' || turn.toolUses.length === 0) {
      stopReason = turn.stopReason === 'end_turn' ? 'end_turn' : 'tool_use_finalized';
      break;
    }

    // 把 assistant blocks（含 tool_use）写入 messages
    const assistantBlocks: SDKInvocationMessageContentBlock[] = turn.assistantBlocks.map((block) =>
      block.type === 'text'
        ? { type: 'text', text: block.text }
        : { type: 'tool_use', id: block.id, name: block.name, input: block.input ?? {} }
    );
    messages.push({ role: 'assistant', content: assistantBlocks });

    // 串行执行 tool_use
    const toolResultBlocks: SDKInvocationMessageContentBlock[] = [];
    for (const toolUse of turn.toolUses) {
      const result = await executor.execute(
        toolUse,
        { runId: input.runId, conversationId: input.conversationId },
        trackingEmit
      );
      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: result.toolUseId,
        content: result.content,
        ...(result.isError ? { is_error: true } : {})
      });
    }
    messages.push({ role: 'user', content: toolResultBlocks });
  }

  if (stopReason === 'other') {
    // 没有自然 end_turn 而退出循环 = 触发 maxIter 上限
    stopReason = 'max_iterations';
  }

  return {
    text: lastText,
    eventIds: aggregatedEventIds,
    iterations: turnsRun,
    stopReason,
    ...(lastTurnStopReason ? { lastTurnStopReason } : {})
  };
}
