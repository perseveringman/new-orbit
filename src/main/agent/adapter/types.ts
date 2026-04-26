import type { ChildProcess } from 'node:child_process';
import type { UnifiedAgentEvent, UnifiedAgentEventContext } from '@shared/agent-event';
import type { RuntimeDescriptor } from '@shared/orchestration';

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
  normalizeVendorEvent(raw: unknown, context: UnifiedAgentEventContext, index: number): UnifiedAgentEvent;
  start(request: RuntimeStartRequest): RuntimeProcessHandle;
}

export type RuntimeAdapterFactory = (descriptor: RuntimeDescriptor) => RuntimeAdapter;
