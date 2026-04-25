import { _electron as electron, expect, test } from '@playwright/test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function mktmp(prefix: string): Promise<string> {
  const dir = path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function createFakeClaudeHome(): Promise<string> {
  const homeDir = await mktmp('orbit-e2e-home');
  const claudeDir = path.join(homeDir, '.claude', 'local');
  const cliPath = path.join(claudeDir, 'claude');
  await fs.mkdir(claudeDir, { recursive: true });
  await fs.writeFile(
    cliPath,
    `#!/usr/bin/env node
const { setTimeout: sleep } = require('node:timers/promises');

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--version')) {
    process.stdout.write('claude e2e fixture\\n');
    return;
  }

  process.stdout.write(JSON.stringify({
    type: 'message',
    role: 'assistant',
    content: [{ text: 'Starting fake task stream…' }]
  }) + '\\n');
  await sleep(900);

  process.stdout.write(JSON.stringify({
    type: 'message',
    role: 'assistant',
    content: [{ text: 'Streaming fake implementation update.' }]
  }) + '\\n');
  await sleep(1_400);

  process.stdout.write(JSON.stringify({
    type: 'result',
    subtype: 'success',
    result: 'ok',
    input_tokens: 12,
    output_tokens: 34,
    total_cost_usd: 0.001
  }) + '\\n');
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
`,
    'utf8'
  );
  await fs.chmod(cliPath, 0o755);
  return homeDir;
}

test('task chat shows live stream for an autonomous todo task', async () => {
  const userData = await mktmp('orbit-e2e-ud');
  const vaultDir = await mktmp('orbit-e2e-vault');
  const fakeHome = await createFakeClaudeHome();
  const fakeClaudeDir = path.join(fakeHome, '.claude', 'local');
  const fakeClaudeBin = path.join(fakeClaudeDir, 'claude');

  const app = await electron.launch({
    args: [path.join(process.cwd(), 'out/main/index.js')],
    env: {
      ...process.env,
      HOME: fakeHome,
      PATH: `${fakeClaudeDir}${path.delimiter}${process.env.PATH ?? ''}`,
      ORBIT_USER_DATA: userData,
      ORBIT_CLAUDE_PATH_OVERRIDE: fakeClaudeBin,
      NODE_ENV: 'test'
    }
  });

  try {
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await expect(win).toHaveTitle(/Orbit/);

    await fs.mkdir(path.join(vaultDir, '.orbit'), { recursive: true });
    await fs.writeFile(
      path.join(vaultDir, '.orbit', 'config.json'),
      JSON.stringify({ version: '0.8.0', createdAt: new Date().toISOString(), name: 'e2e' }),
      'utf8'
    );
    for (const dir of ['01_Projects', '02_Areas', '03_Resources', '04_Archives']) {
      await fs.mkdir(path.join(vaultDir, dir), { recursive: true });
    }

    await win.evaluate(async (dir: string) => {
      // @ts-expect-error preload bridge
      return window.orbit.workspace.openPath(dir);
    }, vaultDir);
    await expect
      .poll(async () => {
        return win.evaluate(async () => {
          // @ts-expect-error preload bridge
          const current = await window.orbit.workspace.current();
          return current?.path ?? null;
        });
      })
      .toBe(vaultDir);

    const prepared = await win.evaluate(async () => {
      // @ts-expect-error preload bridge
      const project = await window.orbit.project.create({
        slug: 'stream-project',
        template: 'blank',
        name: 'Stream Project'
      });
      // @ts-expect-error preload bridge
      const task = await window.orbit.task.create({
        project_uid: project.uid,
        title: 'Stream task through chat'
      });
      // @ts-expect-error preload bridge
      await window.orbit.task.updateFrontmatter(task.taskPath, {
        status: 'todo',
        execution_strategy: 'autonomous'
      });
      // @ts-expect-error preload bridge
      const full = await window.orbit.task.get(task.taskPath);
      return {
        projectUid: project.uid,
        projectName: 'Stream Project',
        taskTitle: 'Stream task through chat',
        status: full.frontmatter.status,
        executionStrategy: full.frontmatter.execution_strategy
      };
    });

    expect(prepared.status).toBe('todo');
    expect(prepared.executionStrategy).toBe('autonomous');

    await win.reload();
    await win.waitForLoadState('domcontentloaded');

    await win.getByRole('button', { name: prepared.projectName }).click();
    await expect(win.getByRole('button', { name: '+ New Task' })).toBeVisible({ timeout: 15_000 });

    await win.locator('button[draggable="true"]').filter({ hasText: prepared.taskTitle }).click();
    const dialog = win.getByRole('dialog', { name: prepared.taskTitle });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    await dialog.getByRole('button', { name: 'Chat' }).click();
    await expect(dialog.getByText('Task Chat')).toBeVisible({ timeout: 10_000 });

    await dialog
      .getByPlaceholder(`Ask the agent to work on "${prepared.taskTitle}"`)
      .fill('Please start this task and stream progress.');
    await dialog.getByRole('button', { name: 'Send' }).click();

    await expect(dialog.getByText('Agent is working…')).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText('Starting fake task stream…')).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText('Streaming fake implementation update.')).toBeVisible({
      timeout: 15_000
    });
  } finally {
    await app.close();
  }
});
