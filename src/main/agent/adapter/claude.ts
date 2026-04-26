import { mapStreamJson } from '../runner';
import { agentEventToUnifiedAgentEvent } from './compat';
import { startLineProcess } from './process';
import type { RuntimeAdapter, RuntimeProcessHandle, RuntimeStartRequest } from './types';
import os from 'node:os';
import path from 'node:path';
import { appendClaudeBypassPermissionsArgs } from '@shared/claude_cli';
import { createUnifiedAgentEvent } from '@shared/agent-event';
import type { UnifiedAgentEvent, UnifiedAgentEventContext } from '@shared/agent-event';
import type { RuntimeDescriptor } from '@shared/orchestration';
import { buildAgentOnboardingPrompt, type AgentOnboardingPromptInput } from '../onboarding';
import { readClaudeSessionDetailById } from '../claude_sessions';

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

  async getSessionTranscript(sessionId: string): Promise<UnifiedAgentEvent[] | null> {
    const detail = await readClaudeSessionDetailById(
      path.join(os.homedir(), '.claude', 'projects'),
      sessionId
    );
    if (!detail) return null;
    const context: UnifiedAgentEventContext = {
      runId: `transcript-${sessionId}`,
      runtime: {
        provider: this.descriptor.provider,
        runtimeId: this.descriptor.runtimeId,
        name: this.descriptor.name
      },
      vendorSessionId: sessionId
    };
    return detail.messages.map((message, index) =>
      createUnifiedAgentEvent('message', context, {
        id: `${context.runId}:message-${index}`,
        spanId: `message-${index}`,
        at: message.at,
        text: `${message.role}: ${message.text}`,
        vendorEvent: message
      })
    );
  }

  start(request: RuntimeStartRequest): RuntimeProcessHandle {
    return startLineProcess(
      this,
      request,
      appendClaudeBypassPermissionsArgs([
        '-p',
        request.prompt,
        '--output-format',
        'stream-json',
        '--verbose'
      ]),
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
