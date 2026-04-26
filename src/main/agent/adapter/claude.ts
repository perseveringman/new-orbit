import { mapStreamJson } from '../runner';
import { agentEventToUnifiedAgentEvent } from './compat';
import { startLineProcess } from './process';
import type { RuntimeAdapter, RuntimeProcessHandle, RuntimeStartRequest } from './types';
import type { UnifiedAgentEvent, UnifiedAgentEventContext } from '@shared/agent-event';
import type { RuntimeDescriptor } from '@shared/orchestration';
import { buildAgentOnboardingPrompt, type AgentOnboardingPromptInput } from '../onboarding';

export class ClaudeRuntimeAdapter implements RuntimeAdapter {
  readonly capabilities = {
    supportsResume: true,
    supportsHooks: true,
    supportsWorktree: true,
    supportsStreaming: true,
    supportsBidirectionalInput: true
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
    const parsed = typeof raw === 'string' ? parseJsonLine(raw) : raw;
    return agentEventToUnifiedAgentEvent(mapStreamJson(parsed, index), context);
  }

  start(request: RuntimeStartRequest): RuntimeProcessHandle {
    return startLineProcess(
      this,
      request,
      ['-p', request.prompt, '--output-format', 'stream-json', '--verbose'],
      false
    );
  }
}

function parseJsonLine(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
