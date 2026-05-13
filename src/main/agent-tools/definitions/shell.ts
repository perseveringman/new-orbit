import type { AgentToolDef } from '@shared/agent-tools';

export const SHELL_TOOL_DEFS: readonly AgentToolDef[] = [
  {
    name: 'orbit_shell_run',
    description:
      'Run a bounded local shell command in the current Orbit vault. Use for diagnostics, typechecks, tests, git status/diff, and other local development inspection. ' +
      'Commands are passed as argv arrays without shell expansion; mutating, secret-reading, or elevated commands require Agent Authority policy grants.',
    cliMethod: 'shell.run',
    family: 'shell',
    risk: 'L1_bounded_local',
    permissions: ['read'],
    source: 'openclaw-inspired',
    status: 'active',
    openClawEquivalent: 'nodes / system command capability',
    timeoutMs: 120_000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['command'],
      properties: {
        command: {
          type: 'array',
          description:
            'Command argv array, e.g. ["npm", "run", "typecheck"]. Shell syntax, pipes, redirects, and command chaining are not interpreted.',
          items: { type: 'string' },
          minItems: 1
        },
        cwd: {
          type: 'string',
          description:
            'Optional vault-relative working directory. Absolute paths are accepted only when they stay inside the current vault.'
        },
        max_seconds: {
          type: 'integer',
          description: 'Optional timeout in seconds (1-120, default 30).'
        },
        intent: {
          type: 'string',
          description: 'Short human-readable reason for running the command.'
        }
      }
    }
  }
];
