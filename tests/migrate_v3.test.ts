import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../src/main/vault';
import { createProject } from '../src/main/project';
import { migrateProjectsToFolders, extractAgentSection } from '../src/main/migrations';
import { runMigrations } from '../src/main/migrations';

async function tmpVault(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-mig-v3-'));
  await createVault(d);
  return d;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

describe('migrate v3: projectsFilesToFolders', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('extractAgentSection pulls a ## Agent block out of the body', () => {
    const body =
      '# Heading\nsome text\n\n## Agent\nYou are Orbit.\nBe kind.\n\n## Next\nmore\n';
    const r = extractAgentSection(body);
    expect(r.agent).toContain('You are Orbit.');
    expect(r.body).not.toContain('## Agent');
    expect(r.body).toContain('## Next');
  });

  it('converts a single-file project into a folder project with uid preserved and .orbit/config.json written', async () => {
    await fs.writeFile(
      path.join(vault, '01_Projects', 'legacy-alpha.md'),
      '---\nuid: LEGACYALPHA1\ntype: project\ntitle: Legacy Alpha\nstatus: active\n---\n# Legacy Alpha\n\n## Agent\nYou are the alpha agent.\n\n## Plan\ndo stuff\n',
      'utf8'
    );

    const result = await migrateProjectsToFolders(vault, {
      // Skip git init inside the new project (keeps the test fast and
      // predictable across environments without git user identity).
      deps: {
        initGit: async () => undefined,
        commitVaultRoot: async () => null
      }
    });
    expect(result.migrated).toContain('legacy-alpha');
    expect(result.skipped).toEqual([]);

    // Single file is gone.
    expect(
      await exists(path.join(vault, '01_Projects', 'legacy-alpha.md'))
    ).toBe(false);

    // Folder exists with expected structure.
    const dir = path.join(vault, '01_Projects', 'legacy-alpha');
    expect(await exists(dir)).toBe(true);

    const cfg = JSON.parse(
      await fs.readFile(path.join(dir, '.orbit', 'config.json'), 'utf8')
    ) as { uid: string; slug: string };
    expect(cfg.uid).toBe('LEGACYALPHA1');
    expect(cfg.slug).toBe('legacy-alpha');

    const readme = await fs.readFile(path.join(dir, 'README.md'), 'utf8');
    expect(readme).toContain('uid: LEGACYALPHA1');
    expect(readme).toContain('slug: legacy-alpha');
    // Agent section was pulled out of the body.
    expect(readme).not.toContain('## Agent');
    expect(readme).toContain('## Plan');

    const agent = await fs.readFile(path.join(dir, 'AGENT.md'), 'utf8');
    expect(agent).toContain('alpha agent');

    expect(await exists(path.join(dir, '.gitignore'))).toBe(true);
    expect(await exists(path.join(dir, '.orbit', 'agent', 'tasks'))).toBe(true);
    expect(await exists(path.join(dir, '.orbit', 'agent', 'memories'))).toBe(true);
    expect(await exists(path.join(dir, '.orbit', 'agent', 'skills', '_index.md'))).toBe(true);
    expect(await exists(path.join(dir, '.orbit', 'agent', 'logs', 'TIMELINE.md'))).toBe(true);
    expect(await exists(path.join(dir, 'CLAUDE.md'))).toBe(true);
    expect(await exists(path.join(dir, 'CODEX.md'))).toBe(true);
    expect(await exists(path.join(dir, 'GEMINI.md'))).toBe(true);
  });

  it('is idempotent: re-running on a vault that already has a folder skips the slug', async () => {
    await fs.writeFile(
      path.join(vault, '01_Projects', 'keep.md'),
      '---\nuid: KEEP00001\ntype: project\ntitle: Keep\nstatus: active\n---\nbody\n',
      'utf8'
    );
    await migrateProjectsToFolders(vault, {
      deps: { initGit: async () => undefined, commitVaultRoot: async () => null }
    });
    // Drop a dummy .md with the same slug to force a collision path.
    await fs.writeFile(
      path.join(vault, '01_Projects', 'keep.md'),
      '---\nuid: KEEP00001\ntype: project\ntitle: Keep\nstatus: active\n---\nbody2\n',
      'utf8'
    );
    const second = await migrateProjectsToFolders(vault, {
      deps: { initGit: async () => undefined, commitVaultRoot: async () => null }
    });
    expect(second.migrated).toEqual([]);
    expect(second.skipped).toContain('keep');
  });

  it('dryRun reports would-migrate slugs without touching the filesystem', async () => {
    await fs.writeFile(
      path.join(vault, '01_Projects', 'dry.md'),
      '---\nuid: DRYRUN001\ntype: project\ntitle: Dry\nstatus: active\n---\n',
      'utf8'
    );
    const r = await migrateProjectsToFolders(vault, {
      dryRun: true,
      deps: { initGit: async () => undefined, commitVaultRoot: async () => null }
    });
    expect(r.migrated).toEqual(['dry']);
    expect(r.dryRun).toBe(true);
    expect(await exists(path.join(vault, '01_Projects', 'dry.md'))).toBe(true);
    expect(await exists(path.join(vault, '01_Projects', 'dry'))).toBe(false);
  });

  // --- R7 tests ---

  it('records a partial failure without aborting the remaining projects', async () => {
    await fs.writeFile(
      path.join(vault, '01_Projects', 'ok-one.md'),
      '---\nuid: OK0000001\ntype: project\ntitle: Ok\nstatus: active\n---\nhello\n',
      'utf8'
    );
    await fs.writeFile(
      path.join(vault, '01_Projects', 'ok-two.md'),
      '---\nuid: OK0000002\ntype: project\ntitle: OkTwo\nstatus: active\n---\nhello\n',
      'utf8'
    );
    // Force the FIRST initGit call to throw; subsequent should still succeed.
    let callCount = 0;
    const result = await migrateProjectsToFolders(vault, {
      deps: {
        initGit: async () => {
          callCount++;
          if (callCount === 1) throw new Error('simulated git init failure');
        },
        commitVaultRoot: async () => 'deadbeef'
      }
    });
    // Sort is alphabetical — ok-one runs first and fails, ok-two succeeds.
    expect(result.failed?.length).toBe(1);
    expect(result.failed?.[0]?.slug).toBe('ok-one');
    expect(result.migrated).toContain('ok-two');
    // The failing project's half-built folder is cleaned up.
    expect(await exists(path.join(vault, '01_Projects', 'ok-one'))).toBe(false);
    // The original legacy file is still in place so the user can retry.
    expect(await exists(path.join(vault, '01_Projects', 'ok-one.md'))).toBe(true);
    // The successful one gave us the expected folder.
    expect(await exists(path.join(vault, '01_Projects', 'ok-two', '.orbit', 'config.json'))).toBe(true);
  });

  it('re-running after a clean migration is a zero-change no-op', async () => {
    await fs.writeFile(
      path.join(vault, '01_Projects', 'idem.md'),
      '---\nuid: IDEM00001\ntype: project\ntitle: Idem\nstatus: active\n---\nidem\n',
      'utf8'
    );
    const first = await migrateProjectsToFolders(vault, {
      deps: { initGit: async () => undefined, commitVaultRoot: async () => 'sha1' }
    });
    expect(first.migrated).toEqual(['idem']);
    const second = await migrateProjectsToFolders(vault, {
      deps: { initGit: async () => undefined, commitVaultRoot: async () => 'sha2' }
    });
    expect(second.migrated).toEqual([]);
    expect(second.skipped).toEqual([]);
    expect(second.failed ?? []).toEqual([]);
    // No candidates ⇒ no snapshot commit, so snapshotSha stays null.
    expect(second.snapshotSha).toBeNull();
  });

  it('returns the pre-migration snapshotSha when the commit dep produces one', async () => {
    await fs.writeFile(
      path.join(vault, '01_Projects', 'snap.md'),
      '---\nuid: SNAP00001\ntype: project\ntitle: Snap\nstatus: active\n---\nsnap\n',
      'utf8'
    );
    const r = await migrateProjectsToFolders(vault, {
      deps: {
        initGit: async () => undefined,
        commitVaultRoot: async () => 'cafef00dcafef00dcafef00dcafef00dcafef00d'
      }
    });
    expect(r.snapshotSha).toBe('cafef00dcafef00dcafef00dcafef00dcafef00d');
    expect(r.migrated).toEqual(['snap']);
  });

  it('runMigrations backfills agent context files into existing folder projects', async () => {
    const proj = await createProject(vault, {
      slug: 'context-me',
      template: 'blank',
      name: 'Context Me'
    });
    await fs.rm(path.join(proj.projectPath, '.orbit', 'agent', 'skills'), {
      recursive: true,
      force: true
    });
    await fs.rm(path.join(proj.projectPath, '.orbit', 'agent', 'logs'), {
      recursive: true,
      force: true
    });
    await fs.rm(path.join(proj.projectPath, 'CLAUDE.md'), { force: true });

    await runMigrations(vault);

    expect(await exists(path.join(proj.projectPath, '.orbit', 'agent', 'skills', '_index.md'))).toBe(
      true
    );
    expect(await exists(path.join(proj.projectPath, '.orbit', 'agent', 'logs', 'TIMELINE.md'))).toBe(
      true
    );
    expect(await exists(path.join(proj.projectPath, 'CLAUDE.md'))).toBe(true);
  });
});
