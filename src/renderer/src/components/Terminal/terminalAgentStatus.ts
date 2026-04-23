import type { OrbitHookEventType } from '../../../../main/agent/hooks/mapEventType';

export type TerminalPaneAgentStatus = 'idle' | 'working' | 'permission' | 'review';

export function applyTerminalPaneEvent(
  _current: TerminalPaneAgentStatus,
  eventType: OrbitHookEventType,
  isVisible: boolean
): TerminalPaneAgentStatus {
  if (eventType === 'Start' || eventType === 'Progress') return 'working';
  if (eventType === 'PermissionRequest') return 'permission';
  if (eventType === 'Stop') return isVisible ? 'idle' : 'review';
  return _current;
}

export function acknowledgeTerminalPaneStatus(
  current: TerminalPaneAgentStatus,
  _isVisible: boolean
): TerminalPaneAgentStatus {
  return current;
}

export function clearTerminalPaneStatus(): TerminalPaneAgentStatus {
  return 'idle';
}
