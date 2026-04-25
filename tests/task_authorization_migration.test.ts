import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { runMigrations } from '../src/main/migrations';
import { migrateV2TaskAuthorization } from '../src/main/migrations/v2_task_authorization';
import * as frontmatter from '../src/main/frontmatter';

const SCRATCH_ROOT = path.join(process.cwd(), '.worktrees', 'task-authorization-migration-tests');

async function scratchVault(prefix: string): Promise<string> {
  await fs.mkdir(SCRATCH_ROOT, { recursive: true });
  const vault = await fs.mkdtemp(path.join(SCRATCH_ROOT, `${prefix}-`));
  await fs.mkdir(path.join(vault, '01_Projects'), { recursive: true });
  return vault;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

describe('v2 task authorization migration', () => {
  let vaults: string[];

  beforeEach(() => {
    vaults = [];
  });

  afterEach(async () => {
    for (const vault of vaults) {
      await fs.rm(vault, { recursive: true, force: true });
    }
    await fs.rm(SCRATCH_ROOT, { recursive: true, force: true });
  });

  it('backfills authorization defaults while preserving immutable and legacy keys', async () => {
    const vault = await scratchVault('defaults');
    vaults.push(vault);
    const taskPath = path.join(vault, '01_Projects', 'task-one.md');
    await fs.writeFile(
      taskPath,
      [
        '---',
        'uid: TASK_ONE',
        'type: task',
        'created: 2026-01-01T00:00:00.000Z',
        'title: Legacy Task',
        'status: todo',
        'generated_from_task_uid: LEGACY_PARENT',
        'pre_conditions:',
        '  - TASK_ZERO',
        '---',
        'Body',
        ''
      ].join('\n'),
      'utf8'
    );
    const mtime = new Date('2026-04-26T10:12:00.000Z');
    await fs.utimes(taskPath, mtime, mtime);

    let snapshotSawOriginal = false;
    const warnings: string[] = [];
    const result = await migrateV2TaskAuthorization(vault, {
      deps: {
        createSafetySnapshot: async () => {
          const raw = await fs.readFile(taskPath, 'utf8');
          snapshotSawOriginal = !raw.includes('created_by:');
          return { snapshotSha: 'snapshot-sha' };
        },
        emitActivity: async () => undefined,
        warn: (message) => warnings.push(message)
      }
    });

    expect(snapshotSawOriginal).toBe(true);
    expect(result.snapshotSha).toBe('snapshot-sha');
    expect(result.migrated).toEqual(['01_Projects/task-one.md']);
    expect(warnings).toEqual([]);

    const raw = await fs.readFile(taskPath, 'utf8');
    const parsed = frontmatter.read(raw);
    expect(parsed.data['uid']).toBe('TASK_ONE');
    expect(parsed.data['type']).toBe('task');
    expect(parsed.data['created']).toBe('2026-01-01T00:00:00.000Z');
    expect(parsed.data['generated_from_task_uid']).toBe('LEGACY_PARENT');
    expect(parsed.data['pre_conditions']).toEqual(['TASK_ZERO']);
    expect(parsed.data['created_by']).toBe('user');
    expect(parsed.data['approved_by']).toBe('user');
    expect(parsed.data['approved_at']).toBe(mtime.toISOString());
    expect(parsed.data['proposed_by_agent_run']).toBeNull();
    expect(parsed.data['proposed_during_task']).toBeNull();
    expect(parsed.data['proposal_id']).toBeNull();
    expect(parsed.data['approval_decision_note']).toBeNull();

    const second = await migrateV2TaskAuthorization(vault, {
      deps: {
        createSafetySnapshot: async () => ({ snapshotSha: 'should-not-run' }),
        emitActivity: async () => undefined,
        warn: (message) => warnings.push(message)
      }
    });
    expect(second.migrated).toEqual([]);
    expect(second.snapshotSha).toBeNull();
  });

  it('warns clearly when the vault is not a git repository', async () => {
    const vault = await scratchVault('no-git');
    vaults.push(vault);
    const taskPath = path.join(vault, '01_Projects', 'task-no-git.md');
    await fs.writeFile(
      taskPath,
      '---\nuid: TASK_NO_GIT\ntype: task\ntitle: No Git\nstatus: todo\n---\nBody\n',
      'utf8'
    );
    const warnings: string[] = [];

    const result = await migrateV2TaskAuthorization(vault, {
      deps: {
        emitActivity: async () => undefined,
        warn: (message) => warnings.push(message)
      }
    });

    expect(result.migrated).toEqual(['01_Projects/task-no-git.md']);
    expect(result.snapshotSha).toBeNull();
    expect(warnings.some((message) => message.includes('vault is not a git repository'))).toBe(
      true
    );
  });

  it('does not write dependency fields during the authorization backfill', async () => {
    const vault = await scratchVault('deps');
    vaults.push(vault);
    const taskPath = path.join(vault, '01_Projects', 'task-deps.md');
    await fs.writeFile(
      taskPath,
      '---\nuid: TASK_DEPS\ntype: task\ntitle: Deps\nstatus: todo\n---\nBody\n',
      'utf8'
    );

    await migrateV2TaskAuthorization(vault, {
      deps: {
        createSafetySnapshot: async () => ({ snapshotSha: 'snapshot-sha' }),
        emitActivity: async () => undefined
      }
    });

    const raw = await fs.readFile(taskPath, 'utf8');
    const parsed = frontmatter.read(raw);
    expect(await exists(taskPath)).toBe(true);
    expect(hasKey(parsed.data, 'depends_on')).toBe(false);
    expect(hasKey(parsed.data, 'derived_from')).toBe(false);
  });

  it('runs from the registered migration runner once', async () => {
    const vault = await scratchVault('runner');
    vaults.push(vault);
    const taskPath = path.join(vault, '01_Projects', 'task-runner.md');
    await fs.writeFile(
      taskPath,
      '---\nuid: TASK_RUNNER\ntype: task\ntitle: Runner\nstatus: todo\n---\nBody\n',
      'utf8'
    );
    const git = simpleGit(vault);
    await git.init();
    await git.addConfig('user.name', 'Orbit Test', false, 'local');
    await git.addConfig('user.email', 'orbit-test@example.invalid', false, 'local');
    await git.add('.');
    await git.commit('initial');

    const first = await runMigrations(vault);
    const raw = await fs.readFile(taskPath, 'utf8');
    const parsed = frontmatter.read(raw);
    const second = await runMigrations(vault);

    expect(first.to).toBe(5);
    expect(first.touched).toBeGreaterThan(0);
    expect(parsed.data['created_by']).toBe('user');
    expect(second.from).toBe(5);
    expect(second.touched).toBe(0);
  });
});

function hasKey(data: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key);
}
