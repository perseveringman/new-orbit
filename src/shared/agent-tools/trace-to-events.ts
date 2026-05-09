/**
 * toolTraceToRuntimeEvents — 把 assistant turn 的 toolTrace 回放为 RuntimeEvent 数组。
 *
 * 用途：renderer 端 ChatView 消费的是 RuntimeEvent 流，而历史 assistant turn 里的 tool 轨迹
 * 存在 turn.toolTrace。为了让关闭会话后重新打开时仍能看到历史 ToolCard（Phase D.4），
 * 我们把 toolTrace 翻译成与实时流同构的 runtime.tool_use / runtime.tool_result 事件。
 *
 * 该函数放在 shared 层（纯数据转换，无副作用），便于 Ask-Anywhere / TaskConversationTab 等
 * 多个 turn → events 转换入口复用；不依赖 Electron/Anthropic。
 *
 * 生成的事件遵守既有 ToolCard 配对约定（parentSpanId = tool_use.spanId = toolUseId）。
 */

import type {
  RuntimeEvent,
  RuntimeToolResultPayload,
  RuntimeToolUsePayload
} from '@shared/chat-protocol';
import type { ToolTraceBlock } from './tool-trace';

export interface ToolTraceToEventsContext {
  conversationId: string;
  /** 落盘到 RuntimeEvent.runId；历史回放时建议用 `hist-${turn.id}`。 */
  runId: string;
  /** 每个 event 的 id prefix；默认 `hist` + spanId 拼接。 */
  idPrefix?: string;
}

/**
 * 把一个 assistant turn 的 toolTrace 转成有序 RuntimeEvent 列表（按原 trace 顺序）。
 * 每个 block 产出两条事件：runtime.tool_use（input 块完成）+ runtime.tool_result（执行结果）。
 */
export function toolTraceToRuntimeEvents(
  trace: ToolTraceBlock[] | undefined,
  ctx: ToolTraceToEventsContext
): RuntimeEvent[] {
  if (!trace || trace.length === 0) return [];
  const prefix = ctx.idPrefix ?? 'hist';
  const out: RuntimeEvent[] = [];
  for (const t of trace) {
    const toolUsePayload: RuntimeToolUsePayload = {
      toolName: t.toolName,
      toolInput: t.input,
      spanId: t.toolUseId
    };
    out.push({
      id: `${prefix}-tu-${t.toolUseId}`,
      at: t.at,
      kind: 'runtime.tool_use',
      conversationId: ctx.conversationId,
      runId: ctx.runId,
      spanId: t.toolUseId,
      payload: toolUsePayload
    });
    if (t.result !== undefined) {
      const toolResultPayload: RuntimeToolResultPayload = {
        toolName: t.toolName,
        result: t.result,
        parentSpanId: t.toolUseId,
        ...(t.isError ? { isError: true } : {})
      };
      out.push({
        id: `${prefix}-tr-${t.toolUseId}`,
        at: t.at,
        kind: 'runtime.tool_result',
        conversationId: ctx.conversationId,
        runId: ctx.runId,
        spanId: `tr-${t.toolUseId}`,
        parentSpanId: t.toolUseId,
        payload: toolResultPayload
      });
    }
  }
  return out;
}
