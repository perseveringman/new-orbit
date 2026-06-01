import type { AgentToolDef } from '@shared/agent-tools';

export const GATEWAY_TOOL_DEFS: readonly AgentToolDef[] = [
  {
    name: 'orbit_gateway_call',
    description:
      'Call an HTTPS API for a selected Orbit skill using that skill’s configured env values. ' +
      'Use env_headers to map HTTP header names to skill env names; secret values are injected by Orbit and never shown to the model.',
    cliMethod: 'gateway.call',
    family: 'plugin',
    risk: 'L4_external_side_effect',
    permissions: ['network', 'secrets', 'external_submit'],
    source: 'openclaw-inspired',
    status: 'active',
    openClawEquivalent: 'gateway',
    timeoutMs: 60_000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['skill', 'url'],
      properties: {
        skill: { type: 'string', description: 'Orbit skill name, e.g. Get.' },
        url: { type: 'string', description: 'Public HTTPS API URL.' },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
          description: 'HTTP method. Default GET.'
        },
        headers: {
          type: 'object',
          description: 'Non-secret literal headers only. Use env_headers for credentials.',
          additionalProperties: { type: 'string' }
        },
        env_headers: {
          type: 'object',
          description:
            'Map HTTP header names to configured skill env var names, e.g. {"Authorization":"GETNOTE_API_KEY"}.',
          additionalProperties: { type: 'string' }
        },
        body_json: {
          description: 'Optional JSON body for non-GET requests.'
        },
        body_text: {
          type: 'string',
          description: 'Optional text body for non-GET requests.'
        },
        max_chars: {
          type: 'integer',
          description: 'Maximum response characters to return (1000-40000, default 12000).'
        }
      }
    }
  }
];
