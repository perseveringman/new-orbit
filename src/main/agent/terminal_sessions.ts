import { promises as fs } from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import {
  buildClaudeResumeCommand,
  ensureClaudeBypassPermissionsCommand
} from '@shared/claude_cli';
import { ORBIT_DIR } from '@shared/constants';
import type { TerminalHookEnvelope } from './hooks/server';
import {
  writeAreaSessionHistory,
  writeProjectSessionHistory
} from '../project_session_history';
import { listAreas } from '../area';
import { listProjects } from '../project';

export interface TerminalAgentSession {
  sessionId: string;
  paneId: string;
  projectUid: string;
  agentType: string;
  vendorSessionId?: string;
  cwd?: string;
  status: 'active' | 'completed' | 'interrupted';
  startedAt: string;
  endedAt?: string;
  lastActivityAt: string;
  title?: string;
  summary?: string;
  resumeCommand?: string;
  stats: {
    promptCount: number;
    permissionCount: number;
  };
}

interface TerminalAgentRegistry {
  sessions: TerminalAgentSession[];
}

function registryPath(vaultPath: string): string {
  return path.join(vaultPath, ORBIT_DIR, 'sessions', 'registry.json');
}

async function readRegistry(vaultPath: string): Promise<TerminalAgentRegistry> {
  try {
    const raw = JSON.parse(await fs.readFile(registryPath(vaultPath), 'utf8')) as {
      sessions?: TerminalAgentSession[];
    };
    return { sessions: Array.isArray(raw.sessions) ? raw.sessions : [] };
  } catch {
    return { sessions: [] };
  }
}

async function writeRegistry(vaultPath: string, registry: TerminalAgentRegistry): Promise<void> {
  const file = registryPath(vaultPath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(registry, null, 2) + '\n', 'utf8');
}

async function syncProjectSessionHistory(
  vaultPath: string,
  projectUid: string,
  registry: TerminalAgentRegistry
): Promise<void> {
  const sessions = registry.sessions.filter((session) => session.projectUid === projectUid).sort(byNewest);
  const projects = await listProjects(vaultPath);
  if (projects.some((project) => project.uid === projectUid)) {
    await writeProjectSessionHistory(vaultPath, projectUid, sessions);
    return;
  }
  const areas = await listAreas(vaultPath);
  if (areas.some((area) => area.uid === projectUid)) {
    await writeAreaSessionHistory(vaultPath, projectUid, sessions);
  }
}

function inferAgentType(rawEventType: string): string {
  if (
    [
      'UserPromptSubmit',
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'Stop',
      'PermissionRequest'
    ].includes(rawEventType)
  ) {
    return 'claude';
  }
  if (
    ['SessionStart', 'session_start', 'exec_approval_request', 'session_end'].includes(
      rawEventType
    )
  ) {
    return 'codex';
  }
  return 'unknown';
}

function byNewest(a: TerminalAgentSession, b: TerminalAgentSession): number {
  return b.lastActivityAt.localeCompare(a.lastActivityAt);
}

function getPayloadString(
  payload: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  if (!payload) return undefined;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

function deriveSessionMetadata(
  envelope: TerminalHookEnvelope,
  agentType: string
): Pick<TerminalAgentSession, 'vendorSessionId' | 'cwd' | 'title' | 'summary' | 'resumeCommand'> {
  const payload = envelope.payload;
  const vendorSessionId = getPayloadString(
    payload,
    'session_id',
    'sessionId',
    'conversation_id',
    'conversationId'
  );
  const rawResumeCommand = getPayloadString(payload, 'resume_command', 'resumeCommand');
  const resumeCommand =
    agentType === 'claude'
      ? rawResumeCommand
        ? ensureClaudeBypassPermissionsCommand(rawResumeCommand)
        : vendorSessionId
          ? buildClaudeResumeCommand(vendorSessionId)
          : undefined
      : rawResumeCommand;

  return {
    ...(vendorSessionId ? { vendorSessionId } : {}),
    ...(getPayloadString(payload, 'cwd') ? { cwd: getPayloadString(payload, 'cwd') } : {}),
    ...(getPayloadString(payload, 'title') ? { title: getPayloadString(payload, 'title') } : {}),
    ...(getPayloadString(payload, 'summary', 'reason')
      ? { summary: getPayloadString(payload, 'summary', 'reason') }
      : {}),
    ...(resumeCommand ? { resumeCommand } : {})
  };
}

function isSameVendorSession(
  session: TerminalAgentSession,
  agentType: string,
  vendorSessionId?: string
): boolean {
  if (session.agentType !== agentType) return false;
  if (session.vendorSessionId || vendorSessionId) {
    return session.vendorSessionId === vendorSessionId;
  }
  return true;
}

function mergeSessionMetadata(
  session: TerminalAgentSession,
  metadata: Pick<TerminalAgentSession, 'vendorSessionId' | 'cwd' | 'title' | 'summary' | 'resumeCommand'>
): void {
  if (metadata.vendorSessionId) session.vendorSessionId = metadata.vendorSessionId;
  if (metadata.cwd) session.cwd = metadata.cwd;
  if (metadata.title) session.title = metadata.title;
  if (metadata.summary) session.summary = metadata.summary;
  if (metadata.resumeCommand) session.resumeCommand = metadata.resumeCommand;
}

function completeSession(session: TerminalAgentSession, ts: string): void {
  session.status = 'completed';
  session.endedAt = ts;
  session.lastActivityAt = ts;
}

export async function ingestTerminalHookEvent(
  vaultPath: string,
  envelope: TerminalHookEnvelope
): Promise<TerminalAgentSession | null> {
  if (!envelope.paneId || !envelope.projectUid) return null;
  const registry = await readRegistry(vaultPath);
  const agentType = inferAgentType(envelope.rawEventType);
  const metadata = deriveSessionMetadata(envelope, agentType);
  const active = registry.sessions.find(
    (session) =>
      session.paneId === envelope.paneId &&
      session.projectUid === envelope.projectUid &&
      session.status === 'active'
  );

  if (active) {
    if (!isSameVendorSession(active, agentType, metadata.vendorSessionId) && envelope.eventType !== 'Stop') {
      completeSession(active, envelope.ts);
    } else {
      active.lastActivityAt = envelope.ts;
      if (envelope.eventType === 'Start') active.stats.promptCount += 1;
      if (envelope.eventType === 'PermissionRequest') active.stats.permissionCount += 1;
      mergeSessionMetadata(active, metadata);
      await writeRegistry(vaultPath, { sessions: registry.sessions.sort(byNewest) });
      await syncProjectSessionHistory(vaultPath, envelope.projectUid, registry);
      return active;
    }
  }

  if (envelope.eventType === 'Stop') {
    await writeRegistry(vaultPath, { sessions: registry.sessions.sort(byNewest) });
    await syncProjectSessionHistory(vaultPath, envelope.projectUid, registry);
    return null;
  }

  const created: TerminalAgentSession = {
    sessionId: `tas_${nanoid(10)}`,
    paneId: envelope.paneId,
    projectUid: envelope.projectUid,
    agentType,
    status: 'active',
    startedAt: envelope.ts,
    lastActivityAt: envelope.ts,
    ...metadata,
    stats: {
      promptCount: envelope.eventType === 'Start' ? 1 : 0,
      permissionCount: envelope.eventType === 'PermissionRequest' ? 1 : 0
    }
  };
  registry.sessions.unshift(created);
  await writeRegistry(vaultPath, { sessions: registry.sessions.sort(byNewest) });
  await syncProjectSessionHistory(vaultPath, envelope.projectUid, registry);
  return created;
}

export async function markTerminalPaneExited(
  vaultPath: string,
  paneId: string,
  ts: string = new Date().toISOString()
): Promise<TerminalAgentSession | null> {
  const registry = await readRegistry(vaultPath);
  const active = registry.sessions.find(
    (session) => session.paneId === paneId && session.status === 'active'
  );
  if (!active) return null;
  completeSession(active, ts);
  await writeRegistry(vaultPath, { sessions: registry.sessions.sort(byNewest) });
  await syncProjectSessionHistory(vaultPath, active.projectUid, registry);
  return active;
}

export async function reconcileTerminalAgentSessionsOnStart(
  vaultPath: string,
  ts: string = new Date().toISOString()
): Promise<void> {
  const registry = await readRegistry(vaultPath);
  let changed = false;
  const changedProjects = new Set<string>();
  for (const session of registry.sessions) {
    if (session.status !== 'active') continue;
    session.status = 'interrupted';
    session.endedAt = ts;
    session.lastActivityAt = ts;
    changed = true;
    changedProjects.add(session.projectUid);
  }
  if (changed) {
    await writeRegistry(vaultPath, { sessions: registry.sessions.sort(byNewest) });
    await Promise.all(
      Array.from(changedProjects, (projectUid) => syncProjectSessionHistory(vaultPath, projectUid, registry))
    );
  }
}

export async function listTerminalAgentSessions(
  vaultPath: string,
  projectUid?: string
): Promise<TerminalAgentSession[]> {
  const registry = await readRegistry(vaultPath);
  const sessions = projectUid
    ? registry.sessions.filter((session) => session.projectUid === projectUid)
    : registry.sessions;
  return [...sessions].sort(byNewest);
}
