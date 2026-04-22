import type { TerminalPaneAgentStatus } from './terminalAgentStatus';

export function upsertTerminalPaneStatus(
  statuses: Map<string, TerminalPaneAgentStatus>,
  leafId: string,
  status: TerminalPaneAgentStatus
): boolean {
  const previous = statuses.get(leafId);
  if (previous === status) return false;
  statuses.set(leafId, status);
  return true;
}
