import type { AgentEvent } from '@shared/agent';

export function buildAgentEventKey(scope: string, event: AgentEvent, order: number): string {
  return `${scope}:${event.kind}:${event.idx}:${event.at}:${order}`;
}
