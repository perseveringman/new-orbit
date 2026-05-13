import type { AgentToolDef } from '@shared/agent-tools';

export const SUBAGENT_TOOL_DEFS: readonly AgentToolDef[] = [
  {
    name: 'orbit_subagent_spawn',
    description:
      'Spawn a bounded helper agent for parallel research or review. Researcher and reviewer profiles are read-only; worker profile requires a stronger Agent Authority grant before it can be used.',
    cliMethod: 'subagent.spawn',
    family: 'subagent',
    risk: 'L1_bounded_local',
    permissions: ['read', 'spawn_subagent'],
    source: 'openclaw-inspired',
    status: 'active',
    openClawEquivalent: 'sessions_spawn / subagents',
    timeoutMs: 30_000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['prompt'],
      properties: {
        prompt: {
          type: 'string',
          description: 'Concrete, self-contained task for the helper agent.'
        },
        profile: {
          type: 'string',
          enum: ['researcher', 'reviewer', 'worker'],
          description: 'Subagent profile. Defaults to researcher.'
        },
        title: {
          type: 'string',
          description: 'Optional short title shown in runtime/task lists.'
        },
        scope: {
          type: 'string',
          description: 'Optional vault-relative path or project area to focus on.'
        }
      }
    }
  },
  {
    name: 'orbit_subagent_list',
    description: 'List currently known helper agent runs and their status.',
    cliMethod: 'subagent.list',
    family: 'subagent',
    risk: 'L0_observe',
    permissions: ['read'],
    source: 'openclaw-inspired',
    status: 'active',
    openClawEquivalent: 'sessions_list / subagents',
    timeoutMs: 10_000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {}
    }
  },
  {
    name: 'orbit_subagent_stop',
    description: 'Stop a running helper agent by run id.',
    cliMethod: 'subagent.stop',
    family: 'subagent',
    risk: 'L2_reversible_draft',
    permissions: ['spawn_subagent'],
    source: 'openclaw-inspired',
    status: 'active',
    openClawEquivalent: 'session control',
    timeoutMs: 10_000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['run_id'],
      properties: {
        run_id: { type: 'string', description: 'Subagent run id.' }
      }
    }
  }
];
