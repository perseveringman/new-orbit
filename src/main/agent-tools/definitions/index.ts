/**
 * Phase A：5 个只读工具。
 * Phase B：12 只读 + 3 低风险写。
 * Phase C：补 propose 系列高风险工具。
 */

import type { AgentToolDef } from '@shared/agent-tools';
import { READ_TOOL_DEFS } from './read';
import { WRITE_TOOL_DEFS } from './write';

/** Phase A 兼容导出。 */
export const PHASE_A_TOOL_DEFS: readonly AgentToolDef[] = [...READ_TOOL_DEFS];

/** Phase B：read + 低风险写工具（agent 直写 + journal + Activity Log）。 */
export const PHASE_B_TOOL_DEFS: readonly AgentToolDef[] = [...READ_TOOL_DEFS, ...WRITE_TOOL_DEFS];

export { READ_TOOL_DEFS, WRITE_TOOL_DEFS };
