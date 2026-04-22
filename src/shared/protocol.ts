export const ORBIT_HOOK_PROTOCOL_VERSION = 1;
export const ORBIT_HOOK_PORT_ENV = "ORBIT_AGENT_HOOK_PORT";
export const ORBIT_HOOK_TOKEN_ENV = "ORBIT_AGENT_HOOK_TOKEN";
export const ORBIT_HOOK_VERSION_ENV = "ORBIT_HOOK_PROTOCOL_VERSION";
export const ORBIT_RUN_ID_ENV = "ORBIT_RUN_ID";
export const ORBIT_WORKTREE_ID_ENV = "ORBIT_WORKTREE_ID";
export const ORBIT_VENDOR_ENV = "ORBIT_VENDOR";

export type HookEventType = "Start" | "Stop" | "PermissionRequest" | "Progress";

export interface HookRequestBody {
  version: number;
  runId: string;
  worktreeId?: string;
  eventType: HookEventType;
  /** Vendor-raw payload — passed through to mapEventType. */
  payload?: Record<string, unknown>;
  ts?: string;
}
