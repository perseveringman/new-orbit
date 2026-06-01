import type { AgentToolDef } from '@shared/agent-tools';

export const SKILL_TOOL_DEFS: readonly AgentToolDef[] = [
  {
    name: 'orbit_skill_read',
    description:
      'Load the full SKILL.md body and Orbit runtime status for an Orbit skill. ' +
      'Use this before answering any skill slash command, natural-language route declared by a skill, or skill credential/configuration request. ' +
      'Can read disabled skills so missing-env guidance can still be grounded in the skill itself.',
    cliMethod: 'skill.read',
    timeoutMs: 30_000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['skill'],
      properties: {
        skill: { type: 'string', description: 'Skill name, for example "Get".' },
        source: {
          type: 'string',
          enum: ['app', 'vault', 'space'],
          description: 'Optional skill source to disambiguate duplicate names.'
        }
      }
    }
  },
  {
    name: 'orbit_skill_resource_read',
    description:
      'Read a supporting resource file bundled with an Orbit skill, such as references/*.md, templates, examples, or assets. ' +
      'Use only after orbit_skill_read when the skill body points to a specific resource. Secret config files are never readable.',
    cliMethod: 'skill.resource.read',
    timeoutMs: 30_000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['skill', 'path'],
      properties: {
        skill: { type: 'string', description: 'Skill name, for example "Get".' },
        path: {
          type: 'string',
          description: 'Skill-relative resource path, for example "references/oauth.md".'
        },
        source: {
          type: 'string',
          enum: ['app', 'vault', 'space'],
          description: 'Optional skill source to disambiguate duplicate names.'
        },
        max_chars: {
          type: 'integer',
          description: 'Maximum characters to return. Defaults to 20000.'
        }
      }
    }
  }
];
