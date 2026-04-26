import { createUnifiedAgentEvent, type UnifiedAgentEvent, type UnifiedAgentEventContext } from '@shared/agent-event';
import type { RuntimeDescriptor } from '@shared/orchestration';
import { startLineProcess } from './process';
import type { RuntimeAdapter, RuntimeProcessHandle, RuntimeStartRequest } from './types';
import { buildAgentOnboardingPrompt, type AgentOnboardingPromptInput } from '../onboarding';

export class CopilotRuntimeAdapter implements RuntimeAdapter {
  readonly capabilities = {
    supportsResume: false,
    supportsHooks: false,
    supportsWorktree: true,
    supportsStreaming: false,
    supportsBidirectionalInput: false
  };

  constructor(readonly descriptor: RuntimeDescriptor) {}

  buildSystemPrompt(prompt: string, input?: AgentOnboardingPromptInput): string {
    return input ? `${buildAgentOnboardingPrompt(input)}\n\n${prompt}` : prompt;
  }

  normalizeVendorEvent(
    raw: unknown,
    context: UnifiedAgentEventContext,
    index: number
  ): UnifiedAgentEvent {
    return createUnifiedAgentEvent('message', context, {
      id: `${context.traceId ?? `trace-${context.runId}`}:copilot-${index}`,
      spanId: `copilot-${index}`,
      text: typeof raw === 'string' ? raw : JSON.stringify(raw),
      vendorEvent: raw
    });
  }

  async getSessionTranscript(_sessionId: string): Promise<UnifiedAgentEvent[] | null> {
    return null;
  }

  start(request: RuntimeStartRequest): RuntimeProcessHandle {
    return startLineProcess(this, request, ['--help'], false);
  }
}
