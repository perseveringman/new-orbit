/**
 * Phase A：仅暴露 5 个只读工具。
 * Phase B：补低风险写工具；Phase C：补高风险 propose 工具。
 */

import type { AgentToolDef } from '@shared/agent-tools';
import { READ_TOOL_DEFS } from './read';

export const PHASE_A_TOOL_DEFS: readonly AgentToolDef[] = [...READ_TOOL_DEFS];

export { READ_TOOL_DEFS };
