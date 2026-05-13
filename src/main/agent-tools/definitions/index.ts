/**
 * Phase A：5 个只读工具。
 * Phase B：12 只读 + 3 低风险写。
 * Phase C：补 3 个 propose 高风险工具（走 approvalService submit）。
 */

import type { AgentToolDef } from '@shared/agent-tools';
import { READ_TOOL_DEFS } from './read';
import { WRITE_TOOL_DEFS } from './write';
import { PROPOSE_TOOL_DEFS } from './propose';
import { WEB_TOOL_DEFS } from './web';
import { SHELL_TOOL_DEFS } from './shell';
import { BROWSER_TOOL_DEFS } from './browser';
import { SUBAGENT_TOOL_DEFS } from './subagent';
import { OPENCLAW_PLANNED_TOOL_VIEWS } from './openclaw-parity';

/** Phase A 兼容导出。 */
export const PHASE_A_TOOL_DEFS: readonly AgentToolDef[] = [...READ_TOOL_DEFS];

/** Phase B：read + 低风险写工具（agent 直写 + journal + Activity Log）。 */
export const PHASE_B_TOOL_DEFS: readonly AgentToolDef[] = [...READ_TOOL_DEFS, ...WRITE_TOOL_DEFS];

/** Phase C：B + propose 系列（agent 提议 → 用户审批）。 */
export const PHASE_C_TOOL_DEFS: readonly AgentToolDef[] = [
  ...READ_TOOL_DEFS,
  ...WEB_TOOL_DEFS,
  ...SHELL_TOOL_DEFS,
  ...BROWSER_TOOL_DEFS,
  ...SUBAGENT_TOOL_DEFS,
  ...WRITE_TOOL_DEFS,
  ...PROPOSE_TOOL_DEFS
];

export const OPENCLAW_PARITY_PLANNED_TOOL_VIEWS = OPENCLAW_PLANNED_TOOL_VIEWS;

export {
  READ_TOOL_DEFS,
  WEB_TOOL_DEFS,
  SHELL_TOOL_DEFS,
  BROWSER_TOOL_DEFS,
  SUBAGENT_TOOL_DEFS,
  WRITE_TOOL_DEFS,
  PROPOSE_TOOL_DEFS
};
