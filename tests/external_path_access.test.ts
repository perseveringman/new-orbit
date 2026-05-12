import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureExternalReadAccess,
  rememberExternalPathApproval,
  resetExternalPathAccessForTests
} from '../src/main/external-path-access';

describe('external path access approval', () => {
  afterEach(() => {
    resetExternalPathAccessForTests();
  });

  it('allows vault paths without prompting', async () => {
    const grant = await ensureExternalReadAccess({
      vaultPath: '/tmp/orbit-vault',
      requestedTarget: 'note.md',
      targetPath: '/tmp/orbit-vault/note.md'
    });

    expect(grant.external).toBe(false);
    expect(grant.approvedVia).toBe('vault');
  });

  it('blocks external paths until the in-app approval flow grants access', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-external-deny-'));
    const file = path.join(dir, 'outside.md');
    await fs.writeFile(file, '# outside', 'utf8');

    await expect(
      ensureExternalReadAccess({
        vaultPath: path.join(dir, 'vault'),
        requestedTarget: file,
        targetPath: file
      })
    ).rejects.toMatchObject({ code: 'external_path_requires_approval' });
  });

  it('remembers approved external directories for the current app session', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-external-allow-'));
    const child = path.join(dir, 'child.md');
    await fs.writeFile(child, '# child', 'utf8');
    rememberExternalPathApproval(path.join(dir, 'vault'), dir);

    const first = await ensureExternalReadAccess({
      vaultPath: path.join(dir, 'vault'),
      requestedTarget: dir,
      targetPath: dir
    });
    const second = await ensureExternalReadAccess({
      vaultPath: path.join(dir, 'vault'),
      requestedTarget: child,
      targetPath: child
    });

    expect(first.approvedVia).toBe('cached');
    expect(second.approvedVia).toBe('cached');
  });
});
