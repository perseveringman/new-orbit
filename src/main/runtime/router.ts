import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  RuntimeRouteDecision,
  RuntimeRouteInput,
  RuntimeRouteMode,
  SDKEndpointTestResult,
  SDKInvocationInput,
  SDKResolvedInvocation
} from '@shared/runtime';
import { publishTraceableEvent } from '../events/bus';
import { AnthropicSDKAdapter, type SDKInvocationResult } from './sdk/anthropic-sdk-adapter';
import type { SDKEndpointRegistry } from './sdk/endpoint-registry';
import type { SDKKeyVault } from './sdk/key-vault';

export class RuntimeRouter {
  constructor(
    private readonly registry: SDKEndpointRegistry,
    private readonly keyVault: SDKKeyVault,
    private readonly adapter = new AnthropicSDKAdapter()
  ) {}

  async decide(input: RuntimeRouteInput): Promise<RuntimeRouteDecision> {
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

  async testEndpoint(endpointId: string, modelHint?: string): Promise<SDKEndpointTestResult> {
    const started = Date.now();
    const resolved = await this.resolveInvocation({ endpointId, model: modelHint, messages: [{ role: 'user', content: 'test' }] });
    try {
      const message = await this.adapter.test(resolved);
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
        model: resolved.model,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async resolveInvocation(input: SDKInvocationInput): Promise<SDKResolvedInvocation> {
    const mode = defaultMode(input.mode ?? 'ask');
    const endpoint = input.endpointId
      ? await this.registry.require(input.endpointId)
      : await this.registry.defaultEndpoint(mode);
    if (!endpoint) throw new Error('sdk_endpoint_not_configured');
    if (!endpoint.enabled) throw new Error(`sdk_endpoint_disabled:${endpoint.id}`);
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
