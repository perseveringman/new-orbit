import type { ChildProcess } from 'node:child_process';
import type { UnifiedAgentEvent, UnifiedAgentEventContext } from '@shared/agent-event';
import type { RuntimeDescriptor } from '@shared/orchestration';
import type { AgentOnboardingPromptInput } from '../onboarding';

export interface RuntimeStartRequest {
  runId: string;
  taskId?: string | null;
  prompt: string;
  cwd: string;
  env?: Record<string, string>;
  traceId?: string;
}

export interface RuntimeProcessHandle {
  process: ChildProcess;
  events: AsyncIterable<UnifiedAgentEvent>;
}

export interface RuntimeAdapterCapabilities {
  supportsResume: boolean;
  supportsHooks: boolean;
  supportsWorktree: boolean;
  supportsStreaming: boolean;
  supportsBidirectionalInput: boolean;
}

export interface RuntimeAdapter {
  readonly descriptor: RuntimeDescriptor;
  readonly capabilities: RuntimeAdapterCapabilities;
  buildSystemPrompt?(prompt: string, input?: AgentOnboardingPromptInput): string;
  normalizeVendorEvent(raw: unknown, context: UnifiedAgentEventContext, index: number): UnifiedAgentEvent;
  getSessionTranscript(sessionId: string): Promise<UnifiedAgentEvent[] | null>;
  start(request: RuntimeStartRequest): RuntimeProcessHandle;
}

export type RuntimeAdapterFactory = (descriptor: RuntimeDescriptor) => RuntimeAdapter;
