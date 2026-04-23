import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getClaudeProjectDirName,
  readClaudeProjectSessionDetail,
  resolveClaudeSessionTarget
} from '../src/main/agent/claude_sessions';

describe('project agent session imports', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-project-agent-imports-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('prefers a bound vendor session id over time-window matching', async () => {
    const projectPath = '/Users/me/dev/orbit';
    const projectDir = path.join(root, getClaudeProjectDirName(projectPath));
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, 'sessions-index.json'),
      JSON.stringify({ version: 1, originalPath: projectPath, entries: [] }, null, 2),
      'utf8'
    );

    await fs.writeFile(
      path.join(projectDir, 'best-overlap.jsonl'),
      [
        JSON.stringify({
          sessionId: 'best-overlap',
          cwd: projectPath,
          timestamp: '2026-04-23T10:00:00Z'
        }),
        JSON.stringify({
          sessionId: 'best-overlap',
          cwd: projectPath,
          timestamp: '2026-04-23T10:20:00Z'
        })
      ].join('\n') + '\n',
      'utf8'
    );

    await fs.writeFile(
      path.join(projectDir, 'bound-id.jsonl'),
      [
        JSON.stringify({
          sessionId: 'bound-id',
          cwd: projectPath,
          timestamp: '2026-04-23T08:00:00Z'
        }),
        JSON.stringify({
          sessionId: 'bound-id',
          cwd: projectPath,
          timestamp: '2026-04-23T08:05:00Z'
        })
      ].join('\n') + '\n',
      'utf8'
    );

    const target = await resolveClaudeSessionTarget(root, projectPath, {
      vendorSessionId: 'bound-id',
      startedAt: '2026-04-23T10:05:00Z',
      endedAt: '2026-04-23T10:10:00Z'
    });
    expect(target?.sessionId).toBe('bound-id');
  });

  it('reads lightweight transcript messages for a bound claude session', async () => {
    const projectPath = '/Users/me/dev/orbit';
    const projectDir = path.join(root, getClaudeProjectDirName(projectPath));
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, 'sessions-index.json'),
      JSON.stringify({ version: 1, originalPath: projectPath, entries: [] }, null, 2),
      'utf8'
    );

    await fs.writeFile(
      path.join(projectDir, 'bound-id.jsonl'),
      [
        JSON.stringify({
          sessionId: 'bound-id',
          cwd: projectPath,
          timestamp: '2026-04-23T11:00:00Z',
          type: 'user',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Continue project memory work' }]
          }
        }),
        JSON.stringify({
          sessionId: 'bound-id',
          cwd: projectPath,
          timestamp: '2026-04-23T11:01:00Z',
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'I found the prior terminal sessions.' }]
          }
        })
      ].join('\n') + '\n',
      'utf8'
    );

    const detail = await readClaudeProjectSessionDetail(root, projectPath, 'bound-id');
    expect(detail).toMatchObject({
      sessionId: 'bound-id',
      cwd: projectPath,
      startedAt: '2026-04-23T11:00:00Z',
      lastActivityAt: '2026-04-23T11:01:00Z',
      messages: [
        {
          role: 'user',
          text: 'Continue project memory work',
          at: '2026-04-23T11:00:00Z'
        },
        {
          role: 'assistant',
          text: 'I found the prior terminal sessions.',
          at: '2026-04-23T11:01:00Z'
        }
      ]
    });
  });

  it('parses mixed Claude content blocks into visible transcript text', async () => {
    const projectPath = '/Users/me/dev/orbit';
    const projectDir = path.join(root, getClaudeProjectDirName(projectPath));
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, 'sessions-index.json'),
      JSON.stringify({ version: 1, originalPath: projectPath, entries: [] }, null, 2),
      'utf8'
    );

    await fs.writeFile(
      path.join(projectDir, 'mixed-content.jsonl'),
      [
        JSON.stringify({
          type: 'permission-mode',
          permissionMode: 'default',
          sessionId: 'mixed-content'
        }),
        JSON.stringify({
          sessionId: 'mixed-content',
          cwd: projectPath,
          timestamp: '2026-04-23T11:00:00Z',
          type: 'user',
          message: {
            role: 'user',
            content: '项目能做什么'
          }
        }),
        JSON.stringify({
          sessionId: 'mixed-content',
          cwd: projectPath,
          timestamp: '2026-04-23T11:00:30Z',
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: '先查看 README 和任务文档。' },
              { type: 'text', text: '我先检查项目文档，确认它当前支持的能力。' },
              {
                type: 'tool_use',
                id: 'call_123',
                name: 'Glob',
                input: { pattern: '**/*.md' }
              }
            ]
          }
        })
      ].join('\n') + '\n',
      'utf8'
    );

    const detail = await readClaudeProjectSessionDetail(root, projectPath, 'mixed-content');
    expect(detail).toMatchObject({
      sessionId: 'mixed-content',
      messages: [
        {
          role: 'user',
          text: '项目能做什么',
          at: '2026-04-23T11:00:00Z'
        },
        {
          role: 'assistant',
          at: '2026-04-23T11:00:30Z'
        }
      ]
    });
    expect(detail?.messages[1]?.text).toContain('Thinking:\n先查看 README 和任务文档。');
    expect(detail?.messages[1]?.text).toContain('我先检查项目文档，确认它当前支持的能力。');
    expect(detail?.messages[1]?.text).toContain('Tool Use: Glob');
  });
});
