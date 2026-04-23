import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface ClaudeProjectSession {
  sessionId: string;
  filePath: string;
  cwd: string;
  startedAt: string;
  lastActivityAt: string;
}

export interface ClaudeProjectSessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  at: string;
}

export interface ClaudeProjectSessionDetail extends ClaudeProjectSession {
  messages: ClaudeProjectSessionMessage[];
}

export function getClaudeProjectDirName(projectPath: string): string {
  return projectPath.replace(/\//g, '-');
}

async function findProjectDir(root: string, projectPath: string): Promise<string | null> {
  const exact = path.join(root, getClaudeProjectDirName(projectPath));
  try {
    const stat = await fs.stat(exact);
    if (stat.isDirectory()) return exact;
  } catch {
    // continue to fallback scan
  }

  let dirs: string[] = [];
  try {
    dirs = await fs.readdir(root);
  } catch {
    return null;
  }
  for (const dir of dirs) {
    const indexPath = path.join(root, dir, 'sessions-index.json');
    try {
      const parsed = JSON.parse(await fs.readFile(indexPath, 'utf8')) as {
        originalPath?: string;
      };
      if (parsed.originalPath === projectPath) return path.join(root, dir);
    } catch {
      // ignore unreadable indexes
    }
  }
  return null;
}

async function readSessionSummary(filePath: string): Promise<ClaudeProjectSession | null> {
  let raw = '';
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
  const lines = raw.split(/\r?\n/).filter(Boolean);
  let sessionId = path.basename(filePath, '.jsonl');
  let cwd = '';
  let startedAt = '';
  let lastActivityAt = '';

  for (const line of lines) {
    try {
      const row = JSON.parse(line) as {
        sessionId?: string;
        cwd?: string;
        timestamp?: string;
      };
      if (typeof row.sessionId === 'string' && row.sessionId) sessionId = row.sessionId;
      if (typeof row.cwd === 'string' && row.cwd) cwd = row.cwd;
      if (typeof row.timestamp === 'string' && row.timestamp) {
        if (!startedAt || row.timestamp < startedAt) startedAt = row.timestamp;
        if (!lastActivityAt || row.timestamp > lastActivityAt) lastActivityAt = row.timestamp;
      }
    } catch {
      // ignore malformed lines
    }
  }
  if (!startedAt || !lastActivityAt) return null;
  return { sessionId, filePath, cwd, startedAt, lastActivityAt };
}

function extractMessageText(row: {
  text?: unknown;
  message?: {
    content?: unknown;
  };
}): string {
  if (typeof row.text === 'string' && row.text.trim()) return row.text.trim();
  const content = row.message?.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const texts = content
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return '';
        const text = (entry as { text?: unknown }).text;
        return typeof text === 'string' ? text.trim() : '';
      })
      .filter(Boolean);
    if (texts.length > 0) return texts.join('\n\n');
  }
  return '';
}

function extractMessageRole(row: {
  type?: unknown;
  message?: {
    role?: unknown;
  };
}): 'user' | 'assistant' | 'system' | null {
  const role = row.message?.role;
  if (role === 'user' || role === 'assistant' || role === 'system') return role;
  if (row.type === 'user' || row.type === 'assistant' || row.type === 'system') {
    return row.type;
  }
  return null;
}

async function readClaudeSessionMessages(filePath: string): Promise<ClaudeProjectSessionMessage[]> {
  let raw = '';
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return [];
  }
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const messages: ClaudeProjectSessionMessage[] = [];

  for (const [index, line] of lines.entries()) {
    try {
      const row = JSON.parse(line) as {
        sessionId?: string;
        timestamp?: string;
        type?: unknown;
        text?: unknown;
        message?: {
          role?: unknown;
          content?: unknown;
        };
      };
      const role = extractMessageRole(row);
      const text = extractMessageText(row);
      if (!role || !text || typeof row.timestamp !== 'string' || !row.timestamp) continue;
      messages.push({
        id: `${row.sessionId ?? path.basename(filePath, '.jsonl')}:${index}`,
        role,
        text,
        at: row.timestamp
      });
    } catch {
      // ignore malformed lines
    }
  }

  return messages;
}

export async function listClaudeProjectSessions(
  root: string,
  projectPath: string
): Promise<ClaudeProjectSession[]> {
  const dir = await findProjectDir(root, projectPath);
  if (!dir) return [];
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const sessions: ClaudeProjectSession[] = [];
  for (const name of files) {
    if (!name.endsWith('.jsonl')) continue;
    const summary = await readSessionSummary(path.join(dir, name));
    if (summary) sessions.push(summary);
  }
  return sessions.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

function overlapMs(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): number {
  const start = Math.max(Date.parse(aStart), Date.parse(bStart));
  const end = Math.min(Date.parse(aEnd), Date.parse(bEnd));
  return Math.max(0, end - start);
}

export async function findBestClaudeResumeTarget(
  root: string,
  projectPath: string,
  sessionWindow: { startedAt: string; endedAt?: string }
): Promise<ClaudeProjectSession | null> {
  const sessions = await listClaudeProjectSessions(root, projectPath);
  if (sessions.length === 0) return null;
  const startedAt = sessionWindow.startedAt;
  const endedAt = sessionWindow.endedAt ?? sessionWindow.startedAt;

  let best: ClaudeProjectSession | null = null;
  let bestScore = -1;
  for (const session of sessions) {
    const overlap = overlapMs(startedAt, endedAt, session.startedAt, session.lastActivityAt);
    const midpointDelta = Math.abs(
      (Date.parse(startedAt) + Date.parse(endedAt)) / 2 -
        (Date.parse(session.startedAt) + Date.parse(session.lastActivityAt)) / 2
    );
    const score = overlap > 0 ? overlap + 1_000_000_000 : -midpointDelta;
    if (score > bestScore) {
      best = session;
      bestScore = score;
    }
  }
  return best;
}

export async function resolveClaudeSessionTarget(
  root: string,
  projectPath: string,
  sessionWindow: { vendorSessionId?: string; startedAt: string; endedAt?: string }
): Promise<ClaudeProjectSession | null> {
  const sessions = await listClaudeProjectSessions(root, projectPath);
  if (sessionWindow.vendorSessionId) {
    const exact = sessions.find((session) => session.sessionId === sessionWindow.vendorSessionId);
    if (exact) return exact;
  }
  return findBestClaudeResumeTarget(root, projectPath, sessionWindow);
}

export async function readClaudeProjectSessionDetail(
  root: string,
  projectPath: string,
  sessionId: string
): Promise<ClaudeProjectSessionDetail | null> {
  const sessions = await listClaudeProjectSessions(root, projectPath);
  const target = sessions.find((session) => session.sessionId === sessionId);
  if (!target) return null;
  return {
    ...target,
    messages: await readClaudeSessionMessages(target.filePath)
  };
}
