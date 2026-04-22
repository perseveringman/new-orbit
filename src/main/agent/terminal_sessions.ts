import { promises as fs } from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { ORBIT_DIR } from '@shared/constants';
import type { TerminalHookEnvelope } from './hooks/server';

export interface TerminalAgentSession {
  sessionId: string;
  paneId: string;
  projectUid: string;
  agentType: string;
  status: 'active' | 'completed' | 'interrupted';
  startedAt: string;
  endedAt?: string;
  lastActivityAt: string;
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

export async function ingestTerminalHookEvent(
  vaultPath: string,
  envelope: TerminalHookEnvelope
): Promise<TerminalAgentSession | null> {
  if (!envelope.paneId || !envelope.projectUid) return null;
  const registry = await readRegistry(vaultPath);
  const active = registry.sessions.find(
    (session) =>
      session.paneId === envelope.paneId &&
      session.projectUid === envelope.projectUid &&
      session.status === 'active'
  );

  if (active) {
    active.lastActivityAt = envelope.ts;
    if (envelope.eventType === 'Start') active.stats.promptCount += 1;
    if (envelope.eventType === 'PermissionRequest') active.stats.permissionCount += 1;
    await writeRegistry(vaultPath, { sessions: registry.sessions.sort(byNewest) });
    return active;
  }

  if (envelope.eventType === 'Stop') {
    return null;
  }

  const created: TerminalAgentSession = {
    sessionId: `tas_${nanoid(10)}`,
    paneId: envelope.paneId,
    projectUid: envelope.projectUid,
    agentType: inferAgentType(envelope.rawEventType),
    status: 'active',
    startedAt: envelope.ts,
    lastActivityAt: envelope.ts,
    stats: {
      promptCount: envelope.eventType === 'Start' ? 1 : 0,
      permissionCount: envelope.eventType === 'PermissionRequest' ? 1 : 0
    }
  };
  registry.sessions.unshift(created);
  await writeRegistry(vaultPath, { sessions: registry.sessions.sort(byNewest) });
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
  active.status = 'completed';
  active.endedAt = ts;
  active.lastActivityAt = ts;
  await writeRegistry(vaultPath, { sessions: registry.sessions.sort(byNewest) });
  return active;
}

export async function reconcileTerminalAgentSessionsOnStart(
  vaultPath: string,
  ts: string = new Date().toISOString()
): Promise<void> {
  const registry = await readRegistry(vaultPath);
  let changed = false;
  for (const session of registry.sessions) {
    if (session.status !== 'active') continue;
    session.status = 'interrupted';
    session.endedAt = ts;
    session.lastActivityAt = ts;
    changed = true;
  }
  if (changed) {
    await writeRegistry(vaultPath, { sessions: registry.sessions.sort(byNewest) });
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
