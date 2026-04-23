export type OrbitHookEventType = 'Start' | 'Stop' | 'PermissionRequest' | 'Progress';

export interface RawHookPayload {
  /** Free-form vendor payload. */
  [k: string]: unknown;
}

/**
 * Normalise a vendor-specific hook payload into an Orbit event type.
 * Supports Claude Code Stop/PreToolUse hooks, Codex exec_approval_request,
 * and a generic {type:'start'|'stop'|...} fallback.
 */
export function mapEventType(
  vendor: string | undefined,
  payload: RawHookPayload
): OrbitHookEventType {
  if (vendor === 'claude') {
    const name = payload.hook_event_name;
    if (name === 'Stop') return 'Stop';
    if (name === 'PreToolUse') return 'PermissionRequest';
    if (name === 'Notification') return 'Progress';
  }
  if (vendor === 'codex' && payload.type === 'exec_approval_request') {
    return 'PermissionRequest';
  }
  const t = payload.type;
  if (t === 'start') return 'Start';
  if (t === 'stop' || t === 'done' || t === 'end') return 'Stop';
  if (t === 'progress') return 'Progress';
  return 'Progress';
}

const TERMINAL_START_EVENTS = new Set([
  'Start',
  'SessionStart',
  'UserPromptSubmit',
  'PostToolUse',
  'PostToolUseFailure',
  'BeforeAgent',
  'AfterTool',
  'session_start',
  'user_prompt_submit',
  'task_started'
]);

const TERMINAL_PROGRESS_EVENTS = new Set(['Progress', 'Notification', 'progress', 'notification']);

const TERMINAL_PERMISSION_EVENTS = new Set([
  'PermissionRequest',
  'PreToolUse',
  'pre_tool_use',
  'exec_approval_request',
  'apply_patch_approval_request',
  'request_user_input'
]);

const TERMINAL_STOP_EVENTS = new Set([
  'Stop',
  'stop',
  'agent-turn-complete',
  'AfterAgent',
  'session_end',
  'task_complete'
]);

export function mapTerminalEventType(rawEventType: string): OrbitHookEventType | null {
  const name = rawEventType.trim();
  if (!name) return null;
  if (TERMINAL_START_EVENTS.has(name)) return 'Start';
  if (TERMINAL_PROGRESS_EVENTS.has(name)) return 'Progress';
  if (TERMINAL_PERMISSION_EVENTS.has(name)) return 'PermissionRequest';
  if (TERMINAL_STOP_EVENTS.has(name)) return 'Stop';
  return null;
}
