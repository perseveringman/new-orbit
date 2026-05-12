import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureExternalReadAccess,
  resetExternalPathAccessForTests,
  setExternalPathAccessConfirmerForTests
} from '../src/main/external-path-access';

describe('external path access approval', () => {
  afterEach(() => {
    resetExternalPathAccessForTests();
  });

  it('allows vault paths without prompting', async () => {
    let prompts = 0;
    setExternalPathAccessConfirmerForTests(() => {
      prompts += 1;
      return false;
    });

    const grant = await ensureExternalReadAccess({
      vaultPath: '/tmp/orbit-vault',
      requestedTarget: 'note.md',
      targetPath: '/tmp/orbit-vault/note.md'
    });

    expect(grant.external).toBe(false);
    expect(grant.approvedVia).toBe('vault');
    expect(prompts).toBe(0);
  });

  it('blocks external paths when the user denies approval', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-external-deny-'));
    const file = path.join(dir, 'outside.md');
    await fs.writeFile(file, '# outside', 'utf8');
    setExternalPathAccessConfirmerForTests(() => false);

    await expect(
      ensureExternalReadAccess({
        vaultPath: path.join(dir, 'vault'),
        requestedTarget: file,
        targetPath: file
      })
    ).rejects.toMatchObject({ code: 'external_path_denied' });
  });

  it('remembers approved external directories for the current app session', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-external-allow-'));
    const child = path.join(dir, 'child.md');
    await fs.writeFile(child, '# child', 'utf8');
    let prompts = 0;
    setExternalPathAccessConfirmerForTests(() => {
      prompts += 1;
      return true;
    });

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

    expect(first.approvedVia).toBe('prompt');
    expect(second.approvedVia).toBe('cached');
    expect(prompts).toBe(1);
  });
});
