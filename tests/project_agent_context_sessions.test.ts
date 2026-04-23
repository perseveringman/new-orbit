import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../src/main/vault';
import { createProject, readProjectConfig } from '../src/main/project';
import { ingestTerminalHookEvent } from '../src/main/agent/terminal_sessions';
import {
  ensureProjectAgentContext,
  readProjectAgentContextMeta
} from '../src/main/project_agent_context';

async function tmpVault(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-project-session-context-'));
  await createVault(dir);
  return dir;
}

describe('project agent context session memory', () => {
  let vault: string;

  beforeEach(async () => {
    vault = await tmpVault();
  });

  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('creates a project-local session history artifact and points agent entry files to it', async () => {
    const project = await createProject(vault, {
      slug: 'session-memory',
      template: 'blank',
      name: 'Session Memory'
    });

    const claude = await fs.readFile(path.join(project.projectPath, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('.orbit/agent/logs/SESSION_HISTORY.md');

    const sessionHistory = await fs.readFile(
      path.join(project.projectPath, '.orbit', 'agent', 'logs', 'SESSION_HISTORY.md'),
      'utf8'
    );
    expect(sessionHistory).toContain('# 项目会话历史');
  });

  it('refreshes the project-local session history artifact when new project sessions are recorded', async () => {
    const project = await createProject(vault, {
      slug: 'session-refresh',
      template: 'blank',
      name: 'Session Refresh'
    });

    await ingestTerminalHookEvent(vault, {
      eventType: 'Start',
      rawEventType: 'UserPromptSubmit',
      paneId: 'pane-1',
      projectUid: project.uid,
      ts: '2026-04-23T14:00:00Z',
      payload: {
        session_id: 'claude-session-17',
        title: 'Recover project memory',
        summary: 'Collected prior agent sessions for this project'
      }
    });

    const sessionHistory = await fs.readFile(
      path.join(project.projectPath, '.orbit', 'agent', 'logs', 'SESSION_HISTORY.md'),
      'utf8'
    );
    expect(sessionHistory).toContain('Recover project memory');
    expect(sessionHistory).toContain('Collected prior agent sessions for this project');
    expect(sessionHistory).toContain('claude');
  });

  it('imports community AGENTS.md guidance into .orbit context in compatible mode', async () => {
    const project = await createProject(vault, {
      slug: 'compatible-project',
      template: 'blank',
      name: 'Compatible Project',
      agent_exposure: {
        mode: 'compatible',
        exposeAgentsMdBridge: true
      }
    });

    await fs.writeFile(
      path.join(project.projectPath, 'AGENTS.md'),
      '# Community Rules\n\n- Run tests before shipping.\n',
      'utf8'
    );

    const cfg = await readProjectConfig(project.projectPath);
    await fs.writeFile(
      path.join(project.projectPath, '.orbit', 'config.json'),
      JSON.stringify(cfg, null, 2) + '\n',
      'utf8'
    );
    const meta = await readProjectAgentContextMeta(project.projectPath);
    expect(meta).not.toBeNull();
    await ensureProjectAgentContext(project.projectPath, meta!, { overwrite: true });

    const community = await fs.readFile(
      path.join(project.projectPath, '.orbit', 'agent', 'skills', 'community-conventions.md'),
      'utf8'
    );
    expect(community).toContain('Community Rules');
    expect(community).toContain('Run tests before shipping.');

    const bridge = await fs.readFile(path.join(project.projectPath, 'AGENTS.md'), 'utf8');
    expect(bridge).toContain('Community Rules');
  });
});
