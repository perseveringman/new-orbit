import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../src/main/vault';
import { createProject } from '../src/main/project';
import { ensureMcpConfig } from '../src/main/mcp_config';

async function tmpVault(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-mcp-config-'));
  await createVault(d);
  return d;
}

describe('project.create writes .orbit/.mcp.json (R5)', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('emits .orbit/.mcp.json with an Orbit stdio entry when mcpServerPath is supplied', async () => {
    const fakeMcp = '/path/to/orbit/out/mcp/server.cjs';
    const r = await createProject(
      vault,
      {
        slug: 'demo',
        template: 'blank',
        name: 'Demo',
        agent_exposure: {
          mode: 'bridge',
          exposeMcpBridge: true
        }
      },
      { mcpServerPath: fakeMcp }
    );
    const cfgPath = path.join(r.projectPath, '.orbit', '.mcp.json');
    const raw = await fs.readFile(cfgPath, 'utf8');
    const cfg = JSON.parse(raw) as {
      mcpServers: { orbit: { type: string; command: string; args: string[]; env: Record<string, string> } };
    };
    expect(cfg.mcpServers.orbit.type).toBe('stdio');
    expect(cfg.mcpServers.orbit.command).toBe('node');
    expect(cfg.mcpServers.orbit.args).toEqual([fakeMcp]);
    expect(cfg.mcpServers.orbit.env).toEqual({
      ORBIT_VAULT_PATH: vault,
      ORBIT_PROJECT_UID: r.uid,
      ORBIT_PROJECT_SLUG: 'demo'
    });
    const rootRaw = await fs.readFile(path.join(r.projectPath, '.mcp.json'), 'utf8');
    expect(JSON.parse(rootRaw)).toEqual(cfg);
    const manifest = JSON.parse(
      await fs.readFile(path.join(r.projectPath, '.orbit', 'bridge', 'manifest.json'), 'utf8')
    ) as {
      bridges: Record<string, { status: string; targetPath: string }>;
    };
    expect(manifest.bridges['.mcp.json']).toMatchObject({
      status: 'published',
      targetPath: '.mcp.json'
    });
  });

  it('skips .orbit/.mcp.json when no mcpServerPath is supplied (test/CLI path)', async () => {
    const r = await createProject(vault, {
      slug: 'demo2',
      template: 'blank',
      name: 'Demo'
    });
    await expect(fs.access(path.join(r.projectPath, '.orbit', '.mcp.json'))).rejects.toThrow();
  });
});

describe('ensureMcpConfig idempotency', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('returns written:false on a no-op second call', async () => {
    const proj = await createProject(vault, {
      slug: 'ido',
      template: 'blank',
      name: 'Ido'
    });
    const args = {
      vault,
      projectUid: proj.uid,
      projectSlug: 'ido',
      mcpServerPath: '/orb/server.cjs'
    };
    const a = await ensureMcpConfig(proj.projectPath, args);
    expect(a.written).toBe(true);
    const b = await ensureMcpConfig(proj.projectPath, args);
    expect(b.written).toBe(false);
  });

  it('rewrites when args drift but preserves user-added entries', async () => {
    const proj = await createProject(vault, {
      slug: 'mix',
      template: 'blank',
      name: 'Mix'
    });
    const cfgPath = path.join(proj.projectPath, '.orbit', '.mcp.json');
    await fs.writeFile(
      cfgPath,
      JSON.stringify(
        {
          mcpServers: {
            myCustom: {
              type: 'stdio',
              command: '/usr/local/bin/my-mcp',
              args: ['--flag'],
              env: { FOO: 'bar' }
            }
          }
        },
        null,
        2
      ),
      'utf8'
    );
    await ensureMcpConfig(proj.projectPath, {
      vault,
      projectUid: proj.uid,
      projectSlug: 'mix',
      mcpServerPath: '/orb/server.cjs'
    });
    const cfg = JSON.parse(await fs.readFile(cfgPath, 'utf8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(Object.keys(cfg.mcpServers).sort()).toEqual(['myCustom', 'orbit']);
  });

  it('does not overwrite a conflicting root .mcp.json bridge', async () => {
    const proj = await createProject(vault, {
      slug: 'conflict',
      template: 'blank',
      name: 'Conflict',
      agent_exposure: {
        mode: 'bridge',
        exposeMcpBridge: true
      }
    });
    const rootPath = path.join(proj.projectPath, '.mcp.json');
    await fs.writeFile(
      rootPath,
      JSON.stringify(
        {
          mcpServers: {
            existing: {
              type: 'stdio',
              command: 'python',
              args: ['server.py'],
              env: {}
            }
          }
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    await ensureMcpConfig(proj.projectPath, {
      vault,
      projectUid: proj.uid,
      projectSlug: 'conflict',
      mcpServerPath: '/orb/server.cjs'
    });

    const root = JSON.parse(await fs.readFile(rootPath, 'utf8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(root.mcpServers).toEqual({
      existing: {
        type: 'stdio',
        command: 'python',
        args: ['server.py'],
        env: {}
      }
    });
    const manifest = JSON.parse(
      await fs.readFile(path.join(proj.projectPath, '.orbit', 'bridge', 'manifest.json'), 'utf8')
    ) as {
      bridges: Record<string, { status: string; conflictReason?: string }>;
    };
    expect(manifest.bridges['.mcp.json']).toMatchObject({
      status: 'conflict',
      conflictReason: 'target_exists'
    });
  });
});
