import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  RuntimeRouteDecision,
  RuntimeRouteInput,
  RuntimeRouteMode,
  SDKEndpointTestResult,
  SDKInvocationInput,
  SDKResolvedInvocation,
  SDKToolDef
} from '@shared/runtime';
import { publishTraceableEvent } from '../events/bus';
import { AnthropicSDKAdapter, type SDKInvocationResult } from './sdk/anthropic-sdk-adapter';
import type { AgentTurnResult } from '../agent-tools/llm-client';
import { runAgentLoop, type AgentLoopResult } from '../agent-tools/runner';
import type { OrbitToolExecutor } from '../agent-tools/executor';
import type { SDKEndpointRegistry } from './sdk/endpoint-registry';
import type { SDKKeyVault } from './sdk/key-vault';

export class RuntimeRouter {
  constructor(
    private readonly registry: SDKEndpointRegistry,
    private readonly keyVault: SDKKeyVault,
    private readonly adapter = new AnthropicSDKAdapter()
  ) {}

  async decide(input: RuntimeRouteInput): Promise<RuntimeRouteDecision> {
    // Agent 模式优先级最高：SDK 必须可用，否则直接拒绝（不 fallback CLI）。
    if (input.agentMode) {
      const endpoint = input.endpointHint
        ? await this.registry.get(input.endpointHint)
        : await this.registry.defaultEndpoint(defaultMode(input.mode));
      if (!endpoint) {
        return {
          mode: input.mode,
          track: 'cli',
          runtime: 'sdk-agent-unavailable',
          reason: 'agent mode requires a configured SDK endpoint'
        };
      }
      const model = this.registry.resolveModel(endpoint, input.modelHint);
      return {
        mode: input.mode,
        track: 'sdk_agent',
        runtime: `sdk_agent:${endpoint.provider}`,
        endpointId: endpoint.id,
        model,
        reason: 'agent mode dispatched to SDK with tool support'
      };
    }
    if (input.mode === 'task' || input.requiresTools) {
      return {
        mode: input.mode,
        track: 'cli',
        runtime: 'claude-cli',
        reason: input.mode === 'task' ? 'task runtime requires CLI tools' : 'tools requested'
      };
    }
    const endpoint = input.endpointHint
      ? await this.registry.get(input.endpointHint)
      : await this.registry.defaultEndpoint(defaultMode(input.mode));
    if (!endpoint) {
      return {
        mode: input.mode,
        track: 'cli',
        runtime: 'claude-cli',
        reason: 'no configured SDK endpoint'
      };
    }
    const model = this.registry.resolveModel(endpoint, input.modelHint);
    return {
      mode: input.mode,
      track: 'sdk',
      runtime: `sdk:${endpoint.provider}`,
      endpointId: endpoint.id,
      model,
      reason: 'configured SDK endpoint is available',
      fallback: {
        mode: input.mode,
        track: 'cli',
        runtime: 'claude-cli',
        reason: 'SDK route fallback'
      }
    };
  }

  async stream(input: SDKInvocationInput, windows: () => BrowserWindow[]): Promise<SDKInvocationResult> {
    const resolved = await this.resolveInvocation(input);
    await publishTraceableEvent({
      type: 'runtime.sdk.invocation.started',
      kind: 'runtime.sdk.invocation.started',
      source: 'runtime',
      summary: `SDK invocation started (${resolved.endpoint.label})`,
      conversationId: input.conversationId,
      payload: {
        endpoint_id: resolved.endpoint.id,
        endpoint_label: resolved.endpoint.label,
        model: resolved.model,
        mode: input.mode ?? 'ask',
        conversation_id: input.conversationId
      }
    });
    const result = await this.adapter.stream(resolved, input, async (event) => {
      for (const window of windows()) {
        if (!window.isDestroyed()) window.webContents.send(IPC.chat.runtimeEvent, event);
      }
      if (event.kind === 'runtime.cost') {
        const payload = event.payload as {
          inputTokens?: number;
          outputTokens?: number;
          totalUsd?: number;
        };
        await publishTraceableEvent({
          type: 'runtime.sdk.cost',
          kind: 'runtime.sdk.cost',
          source: 'runtime',
          summary: `SDK cost recorded (${resolved.endpoint.label})`,
          conversationId: input.conversationId,
          payload: {
            endpoint_id: resolved.endpoint.id,
            model: resolved.model,
            input_tokens: payload.inputTokens ?? 0,
            output_tokens: payload.outputTokens ?? 0,
            ...(payload.totalUsd !== undefined ? { total_usd: payload.totalUsd } : {})
          }
        });
      }
    });
    await publishTraceableEvent({
      type: 'runtime.sdk.invocation.completed',
      kind: 'runtime.sdk.invocation.completed',
      source: 'runtime',
      summary: `SDK invocation completed (${resolved.endpoint.label})`,
      conversationId: input.conversationId,
      payload: {
        endpoint_id: resolved.endpoint.id,
        endpoint_label: resolved.endpoint.label,
        model: resolved.model,
        mode: input.mode ?? 'ask',
        conversation_id: input.conversationId,
        output_tokens: result.outputTokens
      }
    });
    return result;
  }

  /**
   * Phase A: agent 主循环包装。
   * 解析 endpoint/key/model → 委托纯函数 runAgentLoop，
   * adapter 在每次 streamAgentTurn 里负责广播 RuntimeEvent。
   */
  async runAgentLoop(
    input: {
      system: string;
      messages: SDKInvocationInput['messages'];
      tools: SDKToolDef[];
      conversationId: string;
      runId: string;
      maxIterations: number;
      endpointId?: string;
      model?: string;
      mode?: SDKInvocationInput['mode'];
      /** Phase D：AbortSignal 透传给 adapter.streamAgentTurn。 */
      signal?: AbortSignal;
      /** Phase D：累计 input_tokens 上限（默认 150_000）。 */
      inputTokenBudget?: number;
    },
    executor: OrbitToolExecutor,
    windows: () => BrowserWindow[]
  ): Promise<AgentLoopResult> {
    const resolved = await this.resolveInvocation({
      endpointId: input.endpointId,
      model: input.model,
      messages: [],
      mode: input.mode,
      conversationId: input.conversationId
    });
    return runAgentLoop(
      this.adapter,
      executor,
      {
        invocation: resolved,
        system: input.system,
        messages: input.messages,
        tools: input.tools,
        conversationId: input.conversationId,
        runId: input.runId,
        maxIterations: input.maxIterations,
        ...(input.mode ? { mode: input.mode } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
        ...(input.inputTokenBudget !== undefined
          ? { inputTokenBudget: input.inputTokenBudget }
          : {})
      },
      async (event) => {
        for (const window of windows()) {
          if (!window.isDestroyed()) window.webContents.send(IPC.chat.runtimeEvent, event);
        }
        if (event.kind === 'runtime.cost') {
          const payload = event.payload as {
            inputTokens?: number;
            outputTokens?: number;
            totalUsd?: number;
          };
          await publishTraceableEvent({
            type: 'runtime.sdk.cost',
            kind: 'runtime.sdk.cost',
            source: 'runtime',
            summary: `SDK agent turn cost (${resolved.endpoint.label})`,
            conversationId: input.conversationId,
            payload: {
              endpoint_id: resolved.endpoint.id,
              model: resolved.model,
              input_tokens: payload.inputTokens ?? 0,
              output_tokens: payload.outputTokens ?? 0,
              ...(payload.totalUsd !== undefined ? { total_usd: payload.totalUsd } : {})
            }
          });
        }
      }
    );
  }

  async testEndpoint(
    endpointId: string,
    modelHint?: string,
    prompt?: string
  ): Promise<SDKEndpointTestResult> {
    const started = Date.now();
    let resolvedModel: string | undefined;
    try {
      const resolved = await this.resolveInvocation(
        { endpointId, model: modelHint, messages: [{ role: 'user', content: 'test' }] },
        { allowDisabled: true }
      );
      resolvedModel = resolved.model;
      const message = await this.adapter.test(resolved, prompt);
      return {
        ok: true,
        endpointId,
        model: resolved.model,
        latencyMs: Date.now() - started,
        message
      };
    } catch (error) {
      return {
        ok: false,
        endpointId,
        ...(resolvedModel ? { model: resolvedModel } : {}),
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async resolveInvocation(
    input: SDKInvocationInput,
    options: { allowDisabled?: boolean } = {}
  ): Promise<SDKResolvedInvocation> {
    const mode = defaultMode(input.mode ?? 'ask');
    const endpoint = input.endpointId
      ? await this.registry.require(input.endpointId)
      : await this.registry.defaultEndpoint(mode);
    if (!endpoint) throw new Error('sdk_endpoint_not_configured');
    if (!options.allowDisabled && !endpoint.enabled) {
      throw new Error(`sdk_endpoint_disabled:${endpoint.id}`);
    }
    const apiKey = await this.keyVault.get(endpoint.keyRef);
    if (!apiKey) throw new Error(`sdk_key_missing:${endpoint.id}`);
    return {
      endpoint,
      model: this.registry.resolveModel(endpoint, input.model),
      apiKey
    };
  }
}

function defaultMode(mode: RuntimeRouteMode | 'ask' | 'synthesis' | 'background'): 'ask' | 'synthesis' | 'background' {
  return mode === 'synthesis' || mode === 'background' ? mode : 'ask';
}
