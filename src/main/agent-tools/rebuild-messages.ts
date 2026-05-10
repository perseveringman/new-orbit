/**
 * rebuildMessages — 把 ConversationTurn[] 重建为 Anthropic 风格的 messages。
 *
 * Anthropic 规则（官方文档）：
 *   - assistant content 可以含 text + tool_use blocks
 *   - 紧跟其后的 user content 必须以 tool_result blocks 开头（一一对应每个 tool_use_id）
 *   - 不能孤立出现 tool_use（必须配对 tool_result），也不能孤立出现 tool_result
 *
 * 设计：
 *   - 若 assistant turn 带 replayMessages，则直接按原始 SDK 顺序回放；
 *   - 否则，带 toolTrace 的 assistant turn 拆成两部分：
 *     a) assistant message 的 content blocks（含 tool_use）
 *     b) "tool_result blocks 列表"作为 pendingToolResults，等下一个 user turn 出现时前置
 *   - 如果带 toolTrace 的 assistant turn 是最后一条（理论上不会，但兜底），把 tool_result
 *     合成一条独立的 user message（仅含 tool_result blocks）以保证 Anthropic 通过校验
 *   - 旧 turn（无 toolTrace）按纯 string content 处理，向后兼容
 *
 * 截断策略：
 *   - 历史超过 `maxRetainedAssistantWithTools` 轮 assistant-with-toolTrace 时，
 *     最早的轮次会被压缩为单条 text "Earlier in this conversation, the assistant ran N tools"
 *     从历史里移除（不再喂给 LLM），但落盘的 turn 数据不动
 */

import type { ConversationTurn } from '@shared/conversation';
import type {
  SDKInvocationMessage,
  SDKInvocationMessageContentBlock
} from '@shared/runtime';

export interface RebuildMessagesOptions {
  /** 末尾要追加的当前 user 输入（如果在循环外已 appendTurn 则不需要传）。 */
  appendUserText?: string;
  /**
   * 保留的最近"带 toolTrace 的 assistant turn"数量；
   * 超过则旧轮压缩为 summary text。默认 12。
   */
  maxRetainedAssistantWithTools?: number;
}

interface PendingResult {
  toolUseId: string;
  content: string;
  isError?: boolean;
}

/**
 * 把 turns + 当前 user message 重建为 Anthropic messages。
 *
 * - 不抛错；不合法的 turn（如 toolTrace 与 LLM expectation 错位）回退到纯 text 模式。
 * - 调用方有责任确保最后一条是 user（要么传 appendUserText，要么 turns 末尾已是 user）。
 */
export function rebuildMessages(
  turns: ConversationTurn[],
  options: RebuildMessagesOptions = {}
): SDKInvocationMessage[] {
  const maxRetained = options.maxRetainedAssistantWithTools ?? 12;
  const out: SDKInvocationMessage[] = [];
  let pending: PendingResult[] = [];

  // 先扫描一遍，标记哪些 assistant-with-tools 要压缩
  const toolBearingIndexes: number[] = [];
  turns.forEach((turn, idx) => {
    if (turn.role === 'assistant' && turn.toolTrace && turn.toolTrace.length > 0) {
      toolBearingIndexes.push(idx);
    }
  });
  const compressBefore = Math.max(0, toolBearingIndexes.length - maxRetained);
  const compressedSet = new Set(toolBearingIndexes.slice(0, compressBefore));

  let droppedToolTurnCount = 0;

  for (const [turnIdx, turn] of turns.entries()) {
    if (turn.role === 'system') continue;

    if (turn.role === 'user') {
      // 用户消息：如果有 pending tool_results，前置；否则纯 text
      if (pending.length === 0) {
        out.push({ role: 'user', content: turn.content });
      } else {
        const blocks: SDKInvocationMessageContentBlock[] = pending.map((r) => ({
          type: 'tool_result',
          tool_use_id: r.toolUseId,
          content: r.content,
          ...(r.isError ? { is_error: true } : {})
        }));
        if (turn.content) blocks.push({ type: 'text', text: turn.content });
        out.push({ role: 'user', content: blocks });
        pending = [];
      }
      continue;
    }

    // assistant
    if (turn.replayMessages && turn.replayMessages.length > 0) {
      if (compressedSet.has(turnIdx)) {
        droppedToolTurnCount += 1;
        continue;
      }
      out.push(...turn.replayMessages);
      continue;
    }

    if (turn.toolTrace && turn.toolTrace.length > 0) {
      if (compressedSet.has(turnIdx)) {
        // 压缩：把这一轮的 tool_use/tool_result 完全丢弃（不能漏一个 tool_use 不带 result，否则 Anthropic 拒绝）
        droppedToolTurnCount += 1;
        continue;
      }
      // 把 toolTrace 拆成 tool_use（assistant）+ tool_result（pending）
      const assistantBlocks: SDKInvocationMessageContentBlock[] = [];
      if (turn.content) assistantBlocks.push({ type: 'text', text: turn.content });
      for (const t of turn.toolTrace) {
        assistantBlocks.push({
          type: 'tool_use',
          id: t.toolUseId,
          name: t.toolName,
          input: t.input ?? {}
        });
      }
      out.push({ role: 'assistant', content: assistantBlocks });
      // 准备下一条 user 前置的 tool_results
      pending = turn.toolTrace.map((t) => ({
        toolUseId: t.toolUseId,
        content: t.result ?? '',
        ...(t.isError ? { isError: true } : {})
      }));
      continue;
    }

    // 旧式 assistant：纯 text content
    if (turn.content) {
      out.push({ role: 'assistant', content: turn.content });
    }
  }

  // 追加当前 user message（如果调用方让 rebuild 来拼）
  // 注意：必须放在末尾 pending 兜底之前，让 appendUserText 来消化 pending tool_results。
  if (options.appendUserText) {
    if (pending.length === 0) {
      out.push({ role: 'user', content: options.appendUserText });
    } else {
      const blocks: SDKInvocationMessageContentBlock[] = pending.map((r) => ({
        type: 'tool_result',
        tool_use_id: r.toolUseId,
        content: r.content,
        ...(r.isError ? { is_error: true } : {})
      }));
      blocks.push({ type: 'text', text: options.appendUserText });
      out.push({ role: 'user', content: blocks });
      pending = [];
    }
  }

  // 末尾如果还有 pending tool_results 又没有跟上 user turn，必须补一条 user message
  // 兜底（Anthropic 不允许孤立 tool_use）。
  if (pending.length > 0) {
    out.push({
      role: 'user',
      content: pending.map((r) => ({
        type: 'tool_result',
        tool_use_id: r.toolUseId,
        content: r.content,
        ...(r.isError ? { is_error: true } : {})
      }))
    });
    pending = [];
  }

  // 压缩信息：在最前面塞一条 system-style assistant text，告知 LLM 之前轮次被截断
  if (droppedToolTurnCount > 0) {
    out.unshift({
      role: 'assistant',
      content: `[Earlier in this conversation, the assistant ran ${droppedToolTurnCount} tool-bearing turn(s); details have been compacted to save context.]`
    });
  }

  return out;
}
