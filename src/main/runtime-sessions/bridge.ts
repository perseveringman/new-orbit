import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  RuntimeSessionBridgeStatus,
  RuntimeSessionDetail,
  RuntimeSessionDisplaySettings,
  RuntimeSessionGroups,
  RuntimeSessionListItem,
  RuntimeSessionMarkdownResult
} from '@shared/runtime-sessions';

const DEFAULT_ROOT = path.join(os.homedir(), 'Developer', 'ai-session-to-md');
const AGENT_KEYS = ['claude', 'claude-internal', 'amp', 'copilot', 'codebuddy', 'box', 'codex'] as const;
const CACHE_LIMIT_PER_AGENT = 200;

type AgentKey = (typeof AGENT_KEYS)[number];

interface AISessionToMdModule {
  getCachedSessions(agent: string): unknown[] | null;
  setCachedSessions(agent: string, data: unknown[]): void;
  invalidateCache(agent?: string): void;
  listClaudeSessions(): Promise<unknown[]>;
  listClaudeInternalSessions(): Promise<unknown[]>;
  listAmpSessions(): Promise<unknown[]>;
  listCopilotSessions(): Promise<unknown[]>;
  listCodebuddySessions(): Promise<unknown[]>;
  listBoxSessions(): Promise<unknown[]>;
  listCodexSessions(): Promise<unknown[]>;
  getSession(agent: string, id: string): Promise<RuntimeSessionDetail | null>;
  sessionToMarkdown(session: RuntimeSessionDetail, options?: Partial<RuntimeSessionDisplaySettings>): string;
}

let modulePromise: Promise<AISessionToMdModule> | null = null;

export async function runtimeSessionBridgeStatus(): Promise<RuntimeSessionBridgeStatus> {
  const root = resolveBridgeRoot();
  const modulePath = bridgeModulePath(root);
  try {
    await fs.access(modulePath);
    return { available: true, root, modulePath };
  } catch {
    return {
      available: false,
      root,
      modulePath,
      message: `找不到 ai-session-to-md：${modulePath}`
    };
  }
}

export async function listRuntimeSessions(refresh = false): Promise<RuntimeSessionGroups> {
  const mod = await loadAISessionToMdModule();
  if (refresh) mod.invalidateCache();

  const entries = await Promise.all(
    AGENT_KEYS.map(async (agent) => {
      let sessions = mod.getCachedSessions(agent);
      if (!sessions) {
        sessions = await listForAgent(mod, agent);
        mod.setCachedSessions(agent, sessions);
      }
      return [agent, sessions.slice(0, CACHE_LIMIT_PER_AGENT).map(normalizeListItem)] as const;
    })
  );

  const groups = Object.fromEntries(entries) as Omit<RuntimeSessionGroups, 'total'>;
  return {
    ...groups,
    total: entries.reduce((sum, [, sessions]) => sum + sessions.length, 0)
  };
}

export async function getRuntimeSession(agent: string, id: string): Promise<RuntimeSessionDetail | null> {
  const mod = await loadAISessionToMdModule();
  return mod.getSession(normalizeAgentKey(agent), id);
}

export async function getRuntimeSessionMarkdown(
  agent: string,
  id: string,
  settings?: Partial<RuntimeSessionDisplaySettings>
): Promise<RuntimeSessionMarkdownResult> {
  const mod = await loadAISessionToMdModule();
  const session = await mod.getSession(normalizeAgentKey(agent), id);
  if (!session) throw new Error(`Session not found: ${agent}/${id}`);
  return {
    text: mod.sessionToMarkdown(session, settings),
    filename: `${session.id.replace(/\//g, '_')}.md`
  };
}

async function loadAISessionToMdModule(): Promise<AISessionToMdModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const status = await runtimeSessionBridgeStatus();
      if (!status.available) throw new Error(status.message ?? 'ai-session-to-md unavailable');
      return import(pathToFileURL(status.modulePath).href) as Promise<AISessionToMdModule>;
    })();
  }
  return modulePromise;
}

function resolveBridgeRoot(): string {
  return process.env['AI_SESSION_TO_MD_ROOT'] || DEFAULT_ROOT;
}

function bridgeModulePath(root: string): string {
  return path.join(root, 'lib', 'sessions.js');
}

function listForAgent(mod: AISessionToMdModule, agent: AgentKey): Promise<unknown[]> {
  switch (agent) {
    case 'claude':
      return mod.listClaudeSessions();
    case 'claude-internal':
      return mod.listClaudeInternalSessions();
    case 'amp':
      return mod.listAmpSessions();
    case 'copilot':
      return mod.listCopilotSessions();
    case 'codebuddy':
      return mod.listCodebuddySessions();
    case 'box':
      return mod.listBoxSessions();
    case 'codex':
      return mod.listCodexSessions();
  }
}

function normalizeListItem(value: unknown): RuntimeSessionListItem {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    id: stringValue(record['id']) || 'unknown',
    agent: stringValue(record['agent']) || 'unknown',
    title: stringValue(record['title']),
    summary: stringValue(record['summary']),
    timestamp: stringValue(record['timestamp']),
    sortTimestamp: stringValue(record['sortTimestamp']) || undefined,
    projectName: stringValue(record['projectName']) || undefined,
    source: stringValue(record['source']) || undefined,
    path: stringValue(record['path']) || undefined,
    size: numberValue(record['size']),
    model: stringValue(record['model']) || undefined
  };
}

function normalizeAgentKey(agent: string): AgentKey {
  if (agent === 'claude-code') return 'claude';
  if ((AGENT_KEYS as readonly string[]).includes(agent)) return agent as AgentKey;
  throw new Error(`Unknown runtime session agent: ${agent}`);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
