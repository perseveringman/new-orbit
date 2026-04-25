import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PlanProposal } from '../src/shared/orchestration';
import * as frontmatter from '../src/main/frontmatter';
import { createProject } from '../src/main/project';
import {
  buildPlannerPublishDependencyGraph,
  publishPlanProposal,
  savePlanProposal
} from '../src/main/orchestration/planner';
import { detectAnyCycle } from '../src/main/dependencies/graph';
import { createVault } from '../src/main/vault';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = path.join(process.cwd(), 'test-results', 'planner-publish-dependency', randomUUID());
  await fs.mkdir(vaultPath, { recursive: true });
  await createVault(vaultPath);
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

function proposal(projectUid: string, edges: PlanProposal['edges']): PlanProposal {
  return {
    proposalId: 'proposal_deps',
    projectUid,
    version: 1,
    title: 'Dependency plan',
    summary: 'Publish dependencies',
    status: 'accepted',
    createdAt: '2026-04-26T00:00:00.000Z',
    updatedAt: '2026-04-26T00:00:00.000Z',
    source: 'human',
    nodes: [
      { taskUid: 'task_a', title: 'Task A' },
      { taskUid: 'task_b', title: 'Task B' }
    ],
    edges
  };
}

describe('planner publish dependency materialization', () => {
  it('materializes depends_on from proposal edges without using derived_from for scheduling', async () => {
    const project = await createProject(vaultPath, {
      slug: 'planner-deps',
      template: 'blank',
      name: 'Planner Deps'
    });
    await savePlanProposal(
      vaultPath,
      proposal(project.uid, [
        { id: 'edge_a_b', fromTaskUid: 'task_a', toTaskUid: 'task_b', kind: 'depends_on' }
      ])
    );

    const result = await publishPlanProposal(vaultPath, project.uid, 'proposal_deps');
    const taskBPath = result.createdTaskUids.includes('task_b')
      ? path.join(project.projectPath, '.orbit', 'agent', 'tasks')
      : '';
    const files = await fs.readdir(taskBPath);
    const rawB = await fs.readFile(
      path.join(taskBPath, files.find((file) => file.includes('task-b')) ?? ''),
      'utf8'
    );
    const parsedB = frontmatter.read(rawB).data;

    expect(parsedB['depends_on']).toEqual(['task_a']);
    expect(parsedB['derived_from']).toBeUndefined();
  });

  it('rejects cyclic planner dependency graphs before publishing', async () => {
    const project = await createProject(vaultPath, {
      slug: 'planner-cycle',
      template: 'blank',
      name: 'Planner Cycle'
    });
    await savePlanProposal(
      vaultPath,
      proposal(project.uid, [
        { id: 'edge_a_b', fromTaskUid: 'task_a', toTaskUid: 'task_b', kind: 'depends_on' },
        { id: 'edge_b_a', fromTaskUid: 'task_b', toTaskUid: 'task_a', kind: 'depends_on' }
      ])
    );

    expect([...buildPlannerPublishDependencyGraph(proposal(project.uid, [])).keys()]).toContain('task_a');
    await expect(publishPlanProposal(vaultPath, project.uid, 'proposal_deps')).rejects.toThrow(
      /cyclic dependencies/
    );
  });

  it('detects cycles that span existing depends_on and newly proposed edges', () => {
    const graph = buildPlannerPublishDependencyGraph(
      proposal('project_uid', [
        { id: 'edge_b_a', fromTaskUid: 'task_b', toTaskUid: 'task_a', kind: 'depends_on' }
      ]),
      [
        {
          id: 'file:task_b',
          source: 'file',
          status: 'todo',
          title: 'Task B',
          filePath: '/vault/task-b.md',
          relPath: 'task-b.md',
          uid: 'task_b',
          depends_on: ['task_a']
        }
      ]
    );

    expect(detectAnyCycle({ edges: graph })?.path).toEqual(['task_b', 'task_a', 'task_b']);
  });
});
