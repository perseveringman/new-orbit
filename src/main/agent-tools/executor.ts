/**
 * OrbitToolExecutor — agent tool 执行层（thin wrap CliHandlerRegistry）。
 *
 * 设计要点（plans/swift-vortex-darwin.md §2.2 / §6 / §7）：
 *   - 通过 OrbitToolRegistry 解析 cliMethod
 *   - 委托 CliHandlerRegistry.handle(CliRequest) 执行
 *   - 串行 timeout（默认 30s，tool 元数据可覆盖）
 *   - 序列化 result 到 string，截断到上限（避免下一轮 LLM 撑爆）
 *   - 每次执行后发 runtime.tool_result RuntimeEvent +
 *     runtime.sdk.tool_use.completed TraceableEvent（成功/失败合一，用 ok 字段区分）
 *
 * Phase A：不写 Activity / Journal（Phase B 引入）。
 */

import { randomUUID } from 'node:crypto';
import type {
  RuntimeEvent,
  RuntimeToolResultPayload
} from '@shared/chat-protocol';
import type { AgentTurnToolUse } from '@shared/agent-tools';
import { publishTraceableEvent } from '../events/bus';
import type { CliHandlerRegistry } from '../cli_server/registry';
import type { CliResponse } from '@shared/cli_protocol';
import type { OrbitToolRegistry } from './registry';
import type { AgentRuntimeEventSink } from './llm-client';

const DEFAULT_TIMEOUT_MS = 30_000;
/** Tool 结果序列化字节上限（约 10KB），超过截断 + 注明。 */
const RESULT_MAX_BYTES = 10 * 1024;

export interface OrbitToolExecuteContext {
  runId: string;
  conversationId: string;
}

export interface OrbitToolExecuteResult {
  toolUseId: string;
  toolName: string;
  /** 返回给 LLM 的字符串化结果（已截断）。 */
  content: string;
  isError: boolean;
  durationMs: number;
  /** 失败时的简短码（'unknown_tool' / 'timeout' / 'handler_error' / 'parse_error'）。 */
  errorCode?: string;
  /** RuntimeEvent ids（runtime.tool_result）。 */
  eventIds: string[];
}

export class OrbitToolExecutor {
  constructor(
    private readonly toolRegistry: OrbitToolRegistry,
    private readonly cliRegistry: CliHandlerRegistry
  ) {}

  /**
   * 执行单个 tool_use。
   * 不抛错：失败统一以 isError=true 的 OrbitToolExecuteResult 返回，
   * 让 orchestrator 把结果作为 tool_result 回灌给 LLM。
   */
  async execute(
    toolUse: AgentTurnToolUse,
    ctx: OrbitToolExecuteContext,
    emit: AgentRuntimeEventSink
  ): Promise<OrbitToolExecuteResult> {
    const startedAt = Date.now();
    const toolDef = this.toolRegistry.getByName(toolUse.name);
    const eventIds: string[] = [];

    // 1) 上游 adapter 已检测到 partial_json 解析失败
    if (toolUse.parseError) {
      const result = this.finalizeError(
        toolUse,
        startedAt,
        'parse_error',
        `tool input json parse failed: ${toolUse.parseError}`,
        toolDef?.destructive ?? false,
        ctx
      );
      const ev = await emitToolResult(emit, ctx, toolUse, result);
      eventIds.push(ev.id);
      return { ...result, eventIds };
    }

    // 2) tool 名未注册
    if (!toolDef) {
      const result = this.finalizeError(
        toolUse,
        startedAt,
        'unknown_tool',
        `unknown agent tool: ${toolUse.name}`,
        false,
        ctx
      );
      const ev = await emitToolResult(emit, ctx, toolUse, result);
      eventIds.push(ev.id);
      return { ...result, eventIds };
    }

    const timeoutMs = toolDef.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // 3) 串行调用 CliHandlerRegistry，包裹超时
    let response: CliResponse;
    try {
      response = await withTimeout(
        this.cliRegistry.handle({
          id: `agent-${toolUse.id}`,
          method: toolDef.cliMethod,
          params: toolUse.input
        }),
        timeoutMs
      );
    } catch (err) {
      const code = err instanceof TimeoutError ? 'timeout' : 'handler_error';
      const message =
        err instanceof Error ? err.message : `tool execution failed: ${String(err)}`;
      const result = this.finalizeError(
        toolUse,
        startedAt,
        code,
        message,
        toolDef.destructive ?? false,
        ctx
      );
      const ev = await emitToolResult(emit, ctx, toolUse, result);
      eventIds.push(ev.id);
      return { ...result, eventIds };
    }

    const durationMs = Date.now() - startedAt;
    if (response.ok) {
      const { content, size } = serializeResult(response.data);
      publishTraceableEvent({
        kind: 'runtime.sdk.tool_use.completed',
        source: 'runtime',
        summary: `agent tool completed (${toolUse.name})`,
        conversationId: ctx.conversationId,
        runId: ctx.runId,
        payload: {
          ok: true,
          tool_name: toolUse.name,
          span_id: toolUse.id,
          conversation_id: ctx.conversationId,
          run_id: ctx.runId,
          duration_ms: durationMs,
          result_size: size,
          destructive: toolDef.destructive ?? false
        }
      });
      const result: OrbitToolExecuteResult = {
        toolUseId: toolUse.id,
        toolName: toolUse.name,
        content,
        isError: false,
        durationMs,
        eventIds: []
      };
      const ev = await emitToolResult(emit, ctx, toolUse, result);
      eventIds.push(ev.id);
      return { ...result, eventIds };
    }

    // handler 显式返回 error
    const errMsg = `${response.error.code}: ${response.error.message}`;
    publishTraceableEvent({
      kind: 'runtime.sdk.tool_use.completed',
      source: 'runtime',
      summary: `agent tool failed (${toolUse.name})`,
      conversationId: ctx.conversationId,
      runId: ctx.runId,
      payload: {
        ok: false,
        tool_name: toolUse.name,
        span_id: toolUse.id,
        conversation_id: ctx.conversationId,
        run_id: ctx.runId,
        duration_ms: durationMs,
        error_code: response.error.code,
        error_message: response.error.message,
        destructive: toolDef.destructive ?? false
      }
    });
    const result: OrbitToolExecuteResult = {
      toolUseId: toolUse.id,
      toolName: toolUse.name,
      content: errMsg,
      isError: true,
      durationMs,
      errorCode: response.error.code,
      eventIds: []
    };
    const ev = await emitToolResult(emit, ctx, toolUse, result);
    eventIds.push(ev.id);
    return { ...result, eventIds };
  }

  private finalizeError(
    toolUse: AgentTurnToolUse,
    startedAt: number,
    code: string,
    message: string,
    destructive: boolean,
    ctx: OrbitToolExecuteContext
  ): OrbitToolExecuteResult {
    const durationMs = Date.now() - startedAt;
    publishTraceableEvent({
      kind: 'runtime.sdk.tool_use.completed',
      source: 'runtime',
      summary: `agent tool failed (${toolUse.name})`,
      conversationId: ctx.conversationId,
      runId: ctx.runId,
      payload: {
        ok: false,
        tool_name: toolUse.name,
        span_id: toolUse.id,
        conversation_id: ctx.conversationId,
        run_id: ctx.runId,
        duration_ms: durationMs,
        error_code: code,
        error_message: message,
        destructive
      }
    });
    return {
      toolUseId: toolUse.id,
      toolName: toolUse.name,
      content: message,
      isError: true,
      durationMs,
      errorCode: code,
      eventIds: []
    };
  }
}

// =================================================================================
// Helpers
// =================================================================================

class TimeoutError extends Error {
  constructor(ms: number) {
    super(`tool execution exceeded ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function serializeResult(data: unknown): { content: string; size: number } {
  let raw: string;
  try {
    raw =
      typeof data === 'string'
        ? data
        : JSON.stringify(data ?? null, null, 2);
  } catch {
    raw = String(data);
  }
  const size = Buffer.byteLength(raw, 'utf8');
  if (size <= RESULT_MAX_BYTES) return { content: raw, size };
  // 截断时按字节切（保守用 string slice 近似）
  const truncated = raw.slice(0, Math.floor(RESULT_MAX_BYTES * 0.95));
  return {
    content: `${truncated}\n\n[orbit_truncated: original ${size} bytes, showing first ~${truncated.length} chars]`,
    size
  };
}

async function emitToolResult(
  emit: AgentRuntimeEventSink,
  ctx: OrbitToolExecuteContext,
  toolUse: AgentTurnToolUse,
  result: { content: string; isError: boolean }
): Promise<RuntimeEvent<'runtime.tool_result'>> {
  const payload: RuntimeToolResultPayload = {
    toolName: toolUse.name,
    result: result.content,
    parentSpanId: toolUse.id,
    ...(result.isError ? { isError: true } : {})
  };
  const event: RuntimeEvent<'runtime.tool_result'> = {
    id: `${ctx.runId}:tool-result-${randomUUID()}`,
    at: new Date().toISOString(),
    kind: 'runtime.tool_result',
    conversationId: ctx.conversationId,
    runId: ctx.runId,
    spanId: `tool-result-${toolUse.id}`,
    parentSpanId: toolUse.id,
    payload
  };
  await emit(event);
  return event;
}
