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
export function mapEventType(vendor: string | undefined, payload: RawHookPayload): OrbitHookEventType {
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
