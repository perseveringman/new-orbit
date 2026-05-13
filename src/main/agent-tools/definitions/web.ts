/**
 * OpenClaw-inspired web tools for Ask Anywhere.
 *
 * These tools deliberately live in the agent-tool layer instead of the model
 * provider layer, so Anthropic-compatible endpoints can use live web access the
 * same way OpenClaw models do.
 */

import type { AgentToolDef } from '@shared/agent-tools';

export const WEB_TOOL_DEFS: readonly AgentToolDef[] = [
  {
    name: 'orbit_web_search',
    description:
      'Search the public web for current or external information. Use this for recent news, live facts, vendor docs, or anything not likely to be in the Orbit vault. ' +
      'This is not vault search; use orbit_search for local Orbit content.',
    cliMethod: 'web.search',
    family: 'web',
    risk: 'L0_observe',
    permissions: ['read', 'network'],
    source: 'openclaw-inspired',
    status: 'active',
    openClawEquivalent: 'web_search',
    timeoutMs: 45_000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'The web search query.' },
        count: { type: 'integer', description: 'Number of results to return (1-20, default 8).' },
        provider: {
          type: 'string',
          enum: ['auto', 'brave', 'duckduckgo'],
          description:
            'Optional provider. auto tries configured API providers first, then keyless fallback.'
        },
        country: {
          type: 'string',
          description: 'Optional Brave country code, e.g. US, CN, JP.'
        },
        language: {
          type: 'string',
          description: 'Optional search language / locale hint.'
        },
        freshness: {
          type: 'string',
          enum: ['day', 'week', 'month', 'year'],
          description: 'Optional freshness filter for providers that support it.'
        }
      }
    }
  },
  {
    name: 'orbit_web_fetch',
    description:
      'Fetch and extract readable text from a public http(s) URL. Use after orbit_web_search when a result needs source details, quotes, dates, or verification. ' +
      'Private network, localhost, and credential-bearing URLs are blocked.',
    cliMethod: 'web.fetch',
    family: 'web',
    risk: 'L0_observe',
    permissions: ['read', 'network'],
    source: 'openclaw-inspired',
    status: 'active',
    openClawEquivalent: 'web_fetch',
    timeoutMs: 45_000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['url'],
      properties: {
        url: { type: 'string', description: 'Public http(s) URL to fetch.' },
        max_chars: {
          type: 'integer',
          description: 'Maximum extracted characters to return (1000-40000, default 12000).'
        }
      }
    }
  }
];
