import { _electron as electron, test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function mktmp(prefix: string): Promise<string> {
  const d = path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await fs.mkdir(d, { recursive: true });
  return d;
}

test('orbit smoke: launch, create vault, create note', async () => {
  const userData = await mktmp('orbit-e2e-ud');
  const vaultDir = await mktmp('orbit-e2e-vault');

  const app = await electron.launch({
    args: [path.join(process.cwd(), 'out/main/index.js')],
    env: {
      ...process.env,
      ORBIT_USER_DATA: userData,
      NODE_ENV: 'test'
    }
  });

  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await expect(win).toHaveTitle(/Orbit/);

  // Pre-create a vault on disk so we don't have to drive the native picker.
  await fs.mkdir(path.join(vaultDir, '.orbit'), { recursive: true });
  await fs.writeFile(
    path.join(vaultDir, '.orbit', 'config.json'),
    JSON.stringify({ version: '0.8.0', createdAt: new Date().toISOString(), name: 'e2e' }),
    'utf8'
  );
  for (const d of ['01_Projects', '02_Areas', '03_Resources', '04_Archives']) {
    await fs.mkdir(path.join(vaultDir, d), { recursive: true });
  }

  // Open the vault via the exposed IPC (bypasses the native dialog).
  await win.evaluate(async (dir: string) => {
    // @ts-expect-error window.orbit is injected by preload
    return window.orbit.workspace.openPath(dir);
  }, vaultDir);

  // Sidebar should show PARA buckets once the vault is open.
  await expect(win.locator('text=01_Projects').first()).toBeVisible({ timeout: 15_000 });

  // Create a markdown note and verify it appears in the tree.
  const target = path.join(vaultDir, '01_Projects', 'test.md');
  await fs.writeFile(
    target,
    '---\nuid: test-001\ntype: project\ntitle: test\nstatus: active\n---\n\n# test\n',
    'utf8'
  );
  await expect(win.locator('text=test.md').first()).toBeVisible({ timeout: 15_000 });

  await app.close();
});
