import type { AgentToolDef } from '@shared/agent-tools';

export const BROWSER_TOOL_DEFS: readonly AgentToolDef[] = [
  {
    name: 'orbit_browser_open',
    description:
      'Open a public web page in a managed hidden browser session for pages that require JavaScript rendering before inspection. ' +
      'Use orbit_web_fetch for static pages; use browser tools when rendered DOM state matters.',
    cliMethod: 'browser.open',
    family: 'browser',
    risk: 'L0_observe',
    permissions: ['read', 'network'],
    source: 'openclaw-inspired',
    status: 'active',
    openClawEquivalent: 'browser / web navigation',
    timeoutMs: 45_000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['url'],
      properties: {
        url: { type: 'string', description: 'Public http(s) URL to open.' },
        wait_ms: {
          type: 'integer',
          description: 'Optional extra delay after page load before returning (0-5000).'
        }
      }
    }
  },
  {
    name: 'orbit_browser_snapshot',
    description:
      'Read the rendered DOM text, title, URL, and visible links from a managed browser session. Use after orbit_browser_open.',
    cliMethod: 'browser.snapshot',
    family: 'browser',
    risk: 'L0_observe',
    permissions: ['read'],
    source: 'openclaw-inspired',
    status: 'active',
    openClawEquivalent: 'browser / page snapshot',
    timeoutMs: 30_000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['session_id'],
      properties: {
        session_id: { type: 'string', description: 'Browser session id returned by orbit_browser_open.' },
        max_chars: {
          type: 'integer',
          description: 'Maximum body text characters to return (1000-30000, default 12000).'
        }
      }
    }
  },
  {
    name: 'orbit_browser_close',
    description: 'Close a managed browser session when it is no longer needed.',
    cliMethod: 'browser.close',
    family: 'browser',
    risk: 'L0_observe',
    permissions: ['read'],
    source: 'openclaw-inspired',
    status: 'active',
    openClawEquivalent: 'browser / close session',
    timeoutMs: 10_000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['session_id'],
      properties: {
        session_id: { type: 'string', description: 'Browser session id returned by orbit_browser_open.' }
      }
    }
  }
];
