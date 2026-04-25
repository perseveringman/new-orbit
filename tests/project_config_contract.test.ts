import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../src/main/vault';
import { createProject, readProjectConfig } from '../src/main/project';
import { normalizeProjectConfig } from '../src/main/project_config';

describe('project config contract', () => {
  it('scaffolds setup and teardown arrays in .orbit/config.json', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-project-config-'));
    try {
      await createVault(vault);
      const created = await createProject(vault, {
        slug: 'demo',
        template: 'blank',
        name: 'Demo'
      });

      const cfg = await readProjectConfig(created.projectPath);
      expect(cfg).toMatchObject({
        uid: expect.any(String),
        slug: 'demo',
        name: 'Demo',
        execution_context: 'worktree'
      });
      const raw = await fs.readFile(
        path.join(created.projectPath, '.orbit', 'config.json'),
        'utf8'
      );
      expect(JSON.parse(raw)).toMatchObject({
        uid: cfg?.uid,
        slug: 'demo',
        name: 'Demo',
        execution_context: 'worktree',
        agent_exposure: {
          mode: 'isolated',
          exposeMcpBridge: false,
          exposeAgentMdBridge: false,
          exposeAgentsMdBridge: false,
          consumeCommunityAgentMd: false,
          consumeCommunityAgentsMd: false,
          consumeCommunityDotAgent: false
        }
      });
      expect(cfg).toHaveProperty('setup');
      expect(cfg).toHaveProperty('teardown');
      expect(cfg).toHaveProperty('agent_exposure');
      expect(Array.isArray(cfg?.setup)).toBe(true);
      expect(Array.isArray(cfg?.teardown)).toBe(true);
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('falls back to legacy .agent/config.json when .orbit/config.json is missing', async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-project-config-legacy-'));
    try {
      await fs.mkdir(path.join(project, '.agent'), { recursive: true });
      await fs.writeFile(
        path.join(project, '.agent', 'config.json'),
        JSON.stringify(
          {
            uid: 'legacy-uid',
            slug: 'legacy-demo',
            name: 'Legacy Demo',
            template: 'blank',
            created_at: '2026-04-23T00:00:00.000Z',
            setup: [],
            teardown: []
          },
          null,
          2
        ),
        'utf8'
      );

      await expect(fs.access(path.join(project, '.orbit', 'config.json'))).rejects.toThrow();
      await expect(readProjectConfig(project)).resolves.toMatchObject({
        uid: 'legacy-uid',
        slug: 'legacy-demo',
        name: 'Legacy Demo',
        execution_context: 'worktree',
        agent_exposure: {
          mode: 'isolated',
          exposeMcpBridge: false,
          exposeAgentMdBridge: false,
          exposeAgentsMdBridge: false,
          consumeCommunityAgentMd: false,
          consumeCommunityAgentsMd: false,
          consumeCommunityDotAgent: false
        }
      });
    } finally {
      await fs.rm(project, { recursive: true, force: true });
    }
  });

  it('normalizes execution_context with worktree default and sandbox opt-in', () => {
    expect(normalizeProjectConfig({}).execution_context).toBe('worktree');
    expect(normalizeProjectConfig({ execution_context: 'worktree' }).execution_context).toBe(
      'worktree'
    );
    expect(normalizeProjectConfig({ execution_context: 'sandbox' }).execution_context).toBe(
      'sandbox'
    );
    expect(normalizeProjectConfig({ execution_context: 'git' }).execution_context).toBe('worktree');
  });
});
