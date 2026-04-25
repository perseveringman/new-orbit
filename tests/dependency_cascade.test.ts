import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ActivityEventInput } from '../src/main/activity';
import { cascadeDependencyUnavailable } from '../src/main/dependencies/cascade';
import * as frontmatter from '../src/main/frontmatter';
import { createInboxService, createInboxStore } from '../src/main/inbox';
import { createProject, createTask } from '../src/main/project';
import { tasksOfFile } from '../src/main/tasks';
import { createVault } from '../src/main/vault';

let vaultPath: string;

async function readTaskRecord(taskPath: string) {
  const raw = await fs.readFile(taskPath, 'utf8');
  return tasksOfFile(taskPath, path.relative(vaultPath, taskPath), raw)[0]!;
}

beforeEach(async () => {
  vaultPath = path.join(process.cwd(), 'test-results', 'dependency-cascade', randomUUID());
  await fs.mkdir(vaultPath, { recursive: true });
  await createVault(vaultPath);
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('dependency deletion/archive cascade', () => {
  it('blocks non-running dependent tasks and emits C1 Inbox warnings', async () => {
    const project = await createProject(vaultPath, {
      slug: 'deps',
      template: 'blank',
      name: 'Deps'
    });
    const dep = await createTask(vaultPath, {
      project_uid: project.uid,
      uid: 'task_dep',
      title: 'Dependency'
    });
    const current = await createTask(vaultPath, {
      project_uid: project.uid,
      uid: 'task_current',
      title: 'Current',
      frontmatter: { depends_on: ['task_dep'], status: 'todo' }
    });
    const running = await createTask(vaultPath, {
      project_uid: project.uid,
      uid: 'task_running',
      title: 'Running',
      frontmatter: { depends_on: ['task_dep'], status: 'doing' }
    });
    const activities: ActivityEventInput[] = [];
    const inbox = createInboxService(createInboxStore(vaultPath), {
      id: () => `inbox_${activities.length}`,
      emitActivity: (event) => activities.push(event)
    });

    const result = await cascadeDependencyUnavailable({
      vaultPath,
      dependencyUid: 'task_dep',
      dependencyTitle: 'Dependency',
      reason: 'deleted',
      tasks: [await readTaskRecord(dep.taskPath), await readTaskRecord(current.taskPath), await readTaskRecord(running.taskPath)],
      inbox,
      emitActivity: (event) => activities.push(event)
    });

    const parsed = frontmatter.read(await fs.readFile(current.taskPath, 'utf8')).data;
    const runningParsed = frontmatter.read(await fs.readFile(running.taskPath, 'utf8')).data;
    const inboxItems = await inbox.list();

    expect(result.blockedTaskUids).toEqual(['task_current']);
    expect(result.runningTaskUids).toEqual(['task_running']);
    expect(parsed['status']).toBe('blocked');
    expect(parsed['depends_on']).toEqual(['task_dep']);
    expect(runningParsed['status']).toBe('doing');
    expect(inboxItems.items).toHaveLength(2);
    expect(inboxItems.items.every((item) => item.subtype === 'C1')).toBe(true);
    expect(activities.some((event) => event.action === 'task.dependency_changed')).toBe(true);
  });

  it('uses the same blocked + C1 warning policy when a dependency is archived', async () => {
    const project = await createProject(vaultPath, {
      slug: 'archive-deps',
      template: 'blank',
      name: 'Archive Deps'
    });
    const dep = await createTask(vaultPath, {
      project_uid: project.uid,
      uid: 'task_archived_dep',
      title: 'Archived dependency'
    });
    const current = await createTask(vaultPath, {
      project_uid: project.uid,
      uid: 'task_archived_current',
      title: 'Current after archive',
      frontmatter: { depends_on: ['task_archived_dep'], status: 'todo' }
    });
    const inbox = createInboxService(createInboxStore(vaultPath), {
      id: () => 'inbox_archived',
      emitActivity: () => undefined
    });

    const result = await cascadeDependencyUnavailable({
      vaultPath,
      dependencyUid: 'task_archived_dep',
      dependencyTitle: 'Archived dependency',
      reason: 'archived',
      tasks: [await readTaskRecord(dep.taskPath), await readTaskRecord(current.taskPath)],
      inbox,
      emitActivity: () => undefined
    });

    const parsed = frontmatter.read(await fs.readFile(current.taskPath, 'utf8')).data;
    const inboxItems = await inbox.list();

    expect(result.blockedTaskUids).toEqual(['task_archived_current']);
    expect(parsed['status']).toBe('blocked');
    expect(inboxItems.items[0]?.payload).toMatchObject({ reason: 'archived' });
  });
});
