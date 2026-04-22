import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  findBestClaudeResumeTarget,
  getClaudeProjectDirName,
  listClaudeProjectSessions
} from '../src/main/agent/claude_sessions';

describe('claude session discovery', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-claude-sessions-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('maps a project path to Claude project dir naming', () => {
    expect(getClaudeProjectDirName('/Users/me/dev/orbit')).toBe('-Users-me-dev-orbit');
  });

  it('lists session jsonl files and chooses the best resume target by time overlap', async () => {
    const projectPath = '/Users/me/dev/orbit';
    const projectDir = path.join(root, getClaudeProjectDirName(projectPath));
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, 'sessions-index.json'),
      JSON.stringify({ version: 1, originalPath: projectPath, entries: [] }, null, 2),
      'utf8'
    );
    await fs.writeFile(
      path.join(projectDir, 'early.jsonl'),
      [
        JSON.stringify({
          sessionId: 'early',
          cwd: projectPath,
          timestamp: '2026-04-22T09:00:00Z',
          type: 'user'
        }),
        JSON.stringify({
          sessionId: 'early',
          cwd: projectPath,
          timestamp: '2026-04-22T09:10:00Z',
          type: 'assistant'
        })
      ].join('\n') + '\n',
      'utf8'
    );
    await fs.writeFile(
      path.join(projectDir, 'best.jsonl'),
      [
        JSON.stringify({
          sessionId: 'best',
          cwd: projectPath,
          timestamp: '2026-04-22T10:00:00Z',
          type: 'user'
        }),
        JSON.stringify({
          sessionId: 'best',
          cwd: projectPath,
          timestamp: '2026-04-22T10:25:00Z',
          type: 'assistant'
        })
      ].join('\n') + '\n',
      'utf8'
    );

    const sessions = await listClaudeProjectSessions(root, projectPath);
    expect(sessions.map((session) => session.sessionId)).toEqual(['best', 'early']);

    const picked = await findBestClaudeResumeTarget(root, projectPath, {
      startedAt: '2026-04-22T10:05:00Z',
      endedAt: '2026-04-22T10:20:00Z'
    });
    expect(picked?.sessionId).toBe('best');
  });
});
