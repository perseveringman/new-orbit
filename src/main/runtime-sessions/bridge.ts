import { promises as fs } from 'node:fs';
import type {
  RuntimeSessionBridgeStatus,
  RuntimeSessionDetail,
  RuntimeSessionDisplaySettings,
  RuntimeSessionGroups,
  RuntimeSessionListItem,
  RuntimeSessionMarkdownResult,
  RuntimeSessionMessage
} from '@shared/runtime-sessions';
import type { EvidenceSource } from '@shared/evidence';
import {
  defaultExternalAISessionRoots,
  listExternalAISessionSources,
  readExternalAISessionSourceText
} from '../evidence/external-ai-sessions';

const AGENT_KEYS = ['claude', 'claude-internal', 'amp', 'copilot', 'codebuddy', 'box', 'codex'] as const;
const CACHE_LIMIT_PER_AGENT = 200;
const DETAIL_SCAN_LIMIT_PER_AGENT = 5000;
const BUILT_IN_SCANNER_ID = 'orbit://external-ai-sessions';

type AgentKey = (typeof AGENT_KEYS)[number];

let groupsCache: RuntimeSessionGroups | null = null;

export async function runtimeSessionBridgeStatus(): Promise<RuntimeSessionBridgeStatus> {
  const roots = defaultExternalAISessionRoots();
  const rootChecks = await Promise.all(roots.map(async (root) => {
    const stat = await fs.stat(root.dir).catch(() => null);
    return stat ? root : null;
  }));
  const existingRoots = rootChecks.filter((root): root is (typeof roots)[number] => Boolean(root));
  return {
    available: true,
    root: (existingRoots.length ? existingRoots : roots)
      .map((root) => `${root.agent}:${root.dir}`)
      .join(', '),
    modulePath: BUILT_IN_SCANNER_ID,
    ...(!existingRoots.length ? { message: '未发现默认本地 AI 会话目录，扫描结果为空。' } : {})
  };
}

export async function listRuntimeSessions(refresh = false): Promise<RuntimeSessionGroups> {
  if (!refresh && groupsCache) return groupsCache;

  const entries = await Promise.all(
    AGENT_KEYS.map(async (agent) => {
      const sources = await listSourcesForAgent(agent, CACHE_LIMIT_PER_AGENT);
      return [agent, sources.map((source) => sourceToListItem(agent, source))] as const;
    })
  );

  const groups = Object.fromEntries(entries) as Omit<RuntimeSessionGroups, 'total'>;
  groupsCache = {
    ...groups,
    total: entries.reduce((sum, [, sessions]) => sum + sessions.length, 0)
  };
  return groupsCache;
}

export async function getRuntimeSession(agent: string, id: string): Promise<RuntimeSessionDetail | null> {
  const normalizedAgent = normalizeAgentKey(agent);
  const source = await findSource(normalizedAgent, id);
  if (!source) return null;
  const text = await readSessionText(source, true);
  const messages = textToMessages(text, source);
  return {
    id,
    agent: normalizedAgent,
    source: metadataString(source, 'source') ?? normalizedAgent,
    title: source.title,
    projectName: projectNameForSource(source),
    summary: source.summary,
    timestamp: source.time_range?.from ?? source.updated_at,
    messages
  };
}

export async function getRuntimeSessionMarkdown(
  agent: string,
  id: string,
  settings: Partial<RuntimeSessionDisplaySettings> = {}
): Promise<RuntimeSessionMarkdownResult> {
  const normalizedAgent = normalizeAgentKey(agent);
  const source = await findSource(normalizedAgent, id);
  if (!source) throw new Error(`Session not found: ${agent}/${id}`);
  const includeTools = settings.showToolResults !== false;
  const text = await readSessionText(source, includeTools);
  const messages = textToMessages(text, source).filter((message) => messageVisible(message, settings));
  return {
    text: sessionToMarkdown(source, messages),
    filename: `${sanitizeFilename(source.title || id)}.md`
  };
}

async function listSourcesForAgent(agent: AgentKey, limit: number): Promise<EvidenceSource[]> {
  return listExternalAISessionSources({
    includeAgents: [agent],
    limit
  });
}

async function findSource(agent: AgentKey, id: string): Promise<EvidenceSource | null> {
  const sources = await listSourcesForAgent(agent, DETAIL_SCAN_LIMIT_PER_AGENT);
  return sources.find((source) => {
    const relPath = metadataString(source, 'rel_path') ?? source.canonical_ref;
    return relPath === id || source.canonical_ref === id || source.id === id;
  }) ?? null;
}

function sourceToListItem(agent: AgentKey, source: EvidenceSource): RuntimeSessionListItem {
  const relPath = metadataString(source, 'rel_path') ?? source.canonical_ref;
  return {
    id: relPath,
    agent,
    title: source.title,
    summary: source.summary ?? '',
    timestamp: source.time_range?.from ?? source.updated_at,
    sortTimestamp: source.time_range?.to ?? source.updated_at,
    projectName: projectNameForSource(source),
    source: metadataString(source, 'source') ?? agent,
    path: metadataString(source, 'path') ?? source.canonical_ref,
    size: source.fingerprint.size_bytes
  };
}

async function readSessionText(source: EvidenceSource, includeTools: boolean): Promise<string> {
  return readExternalAISessionSourceText({
    ...source,
    privacy: {
      ...source.privacy,
      allow_tool_outputs: includeTools
    }
  }, 'safe_projection');
}

function textToMessages(text: string, source: EvidenceSource): RuntimeSessionMessage[] {
  const blocks = text
    .split(/\n{2,}/u)
    .map((block) => block.trim())
    .filter(Boolean);
  if (!blocks.length && source.summary) {
    return [{
      role: 'assistant',
      content: source.summary,
      timestamp: source.updated_at
    }];
  }
  return blocks.map((block, index) => {
    const parsed = block.match(/^([a-z][\w.-]*):\s*([\s\S]*)$/iu);
    const role = normalizeMessageRole(parsed?.[1]);
    return {
      role,
      content: parsed?.[2]?.trim() || block,
      timestamp: index === 0
        ? source.time_range?.from ?? source.updated_at
        : index === blocks.length - 1
          ? source.time_range?.to ?? source.updated_at
          : undefined
    };
  });
}

function sessionToMarkdown(source: EvidenceSource, messages: RuntimeSessionMessage[]): string {
  const header = [
    `# ${source.title}`,
    source.summary ? `> ${source.summary}` : '',
    '',
    `- Agent: ${metadataString(source, 'agent') ?? 'unknown'}`,
    projectNameForSource(source) ? `- Project: ${projectNameForSource(source)}` : '',
    `- Source: ${source.canonical_ref}`,
    ''
  ].filter((line) => line !== '').join('\n');
  const body = messages.map((message) => [
    `## ${roleLabel(message.role)}`,
    message.timestamp ? `_${message.timestamp}_` : '',
    '',
    message.content ?? ''
  ].filter((line) => line !== '').join('\n')).join('\n\n');
  return `${header}\n${body}`.trim();
}

function messageVisible(message: RuntimeSessionMessage, settings: Partial<RuntimeSessionDisplaySettings>): boolean {
  if (message.role === 'user') return settings.showUser !== false;
  if (message.role === 'assistant') return settings.showAssistant !== false;
  if (message.role === 'tool') return settings.showToolResults !== false;
  return true;
}

function normalizeMessageRole(role: string | undefined): RuntimeSessionMessage['role'] {
  const normalized = role?.toLowerCase();
  if (normalized === 'user' || normalized === 'assistant' || normalized === 'tool' || normalized === 'system') {
    return normalized;
  }
  if (normalized?.includes('tool')) return 'tool';
  if (normalized?.includes('system')) return 'system';
  return 'assistant';
}

function roleLabel(role: string): string {
  if (role === 'user') return 'User';
  if (role === 'assistant') return 'Assistant';
  if (role === 'tool') return 'Tool';
  if (role === 'system') return 'System';
  return role;
}

function projectNameForSource(source: EvidenceSource): string | undefined {
  const project = metadataString(source, 'project_name');
  if (project) return project;
  return source.scope_refs?.find((scope) => scope.kind === 'project')?.ref;
}

function metadataString(source: EvidenceSource, key: string): string | undefined {
  const value = source.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function sanitizeFilename(value: string): string {
  const name = value.replace(/[\\/:*?"<>|]+/gu, '-').replace(/\s+/gu, ' ').trim();
  return (name || 'runtime-session').slice(0, 120);
}

function normalizeAgentKey(agent: string): AgentKey {
  if (agent === 'claude-code') return 'claude';
  if ((AGENT_KEYS as readonly string[]).includes(agent)) return agent as AgentKey;
  throw new Error(`Unknown runtime session agent: ${agent}`);
}
