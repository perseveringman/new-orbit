import { createUnifiedAgentEvent, type UnifiedAgentEvent, type UnifiedAgentEventContext } from '@shared/agent-event';
import type { RuntimeDescriptor } from '@shared/orchestration';
import { startLineProcess } from './process';
import type { RuntimeAdapter, RuntimeProcessHandle, RuntimeStartRequest } from './types';

export class CopilotRuntimeAdapter implements RuntimeAdapter {
  readonly capabilities = {
    supportsResume: false,
    supportsHooks: false,
    supportsWorktree: true,
    supportsStreaming: false,
    supportsBidirectionalInput: false
  };

  constructor(readonly descriptor: RuntimeDescriptor) {}

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

  start(request: RuntimeStartRequest): RuntimeProcessHandle {
    return startLineProcess(this, request, ['--help'], false);
  }
}
