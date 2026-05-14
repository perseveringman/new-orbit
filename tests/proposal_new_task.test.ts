import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApprovalServiceForVault } from '../src/main/approval';
import { ConversationStore } from '../src/main/conversation/store';
import * as frontmatter from '../src/main/frontmatter';
import { createProject } from '../src/main/project';
import { createVault } from '../src/main/vault';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = path.join(process.cwd(), 'test-results', 'proposal-new-task', randomUUID());
  await fs.mkdir(vaultPath, { recursive: true });
  await createVault(vaultPath);
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('new_task approval materialization', () => {
  it('creates an authorized v2 task only after approval', async () => {
    const project = await createProject(vaultPath, {
      slug: 'proposal-project',
      template: 'blank',
      name: 'Proposal Project'
    });
    const service = createApprovalServiceForVault(vaultPath, {
      id: () => 'prop_new_task',
      now: () => new Date('2026-04-26T10:00:00.000Z'),
      emitActivity: () => undefined
    });
    await new ConversationStore(vaultPath).create({
      id: 'conv_design',
      title: 'Design session',
      anchors: [{ kind: 'ask_anywhere_session', refId: 'global', addedAt: '2026-04-26T09:00:00.000Z' }]
    });

    const submitted = await service.submit({
      type: 'new_task',
      submitted_by: 'agent',
      submitted_by_agent_run: 'run_approved',
      submitted_during_task: 'task_parent',
      subject: 'Track follow-up bug',
      payload: {
        project_uid: project.uid,
        title: 'Fix follow-up bug',
        description: 'Bug found while executing parent task.',
        uid: 'task_from_proposal',
        conversation_id: 'conv_design',
        frontmatter: {
          priority: 'high'
        }
      }
    });

    const beforeApproval = path.join(
      project.projectPath,
      '.orbit',
      'agent',
      'tasks',
      '20260426_fix-follow-up-bug.md'
    );
    await expect(fs.stat(beforeApproval)).rejects.toThrow();

    const resolved = await service.resolve(submitted.id, {
      status: 'approved',
      resolution_source: 'chat',
      resolution_note: 'Worth tracking'
    });

    expect(resolved.proposal.status).toBe('approved');
    expect(resolved.proposal.result).toMatchObject({
      type: 'task_created',
      uid: 'task_from_proposal'
    });
    const taskPath = (resolved.proposal.result as { taskPath: string }).taskPath;
    const raw = await fs.readFile(taskPath, 'utf8');
    const parsed = frontmatter.read(raw).data;

    expect(parsed['uid']).toBe('task_from_proposal');
    expect(parsed['status']).toBe('todo');
    expect(parsed['execution_mode']).toBe('human');
    expect(parsed['execution_strategy']).toBe('manual');
    expect(parsed['priority']).toBe('high');
    expect(parsed['created_by']).toBe('agent_run:run_approved');
    expect(parsed['approved_by']).toBe('user');
    expect(parsed['approved_at']).toBe('2026-04-26T10:00:00.000Z');
    expect(parsed['proposed_by_agent_run']).toBe('run_approved');
    expect(parsed['proposed_during_task']).toBe('task_parent');
    expect(parsed['proposal_id']).toBe('prop_new_task');
    expect(parsed['source_conversation_id']).toBe('conv_design');
    expect(parsed['conversation_ids']).toEqual(['conv_design']);
    expect(parsed['approval_decision_note']).toBe('Worth tracking');
    expect(parsed['derived_from']).toBe('task_parent');
    expect(raw).toContain('Bug found while executing parent task.');

    const conversation = await new ConversationStore(vaultPath).get('conv_design');
    expect(conversation?.anchors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'task', refId: 'task_from_proposal' })
      ])
    );
  });

  it('materializes project-backed proposals that use a project slug', async () => {
    const project = await createProject(vaultPath, {
      slug: 'clean-shufang',
      template: 'blank',
      name: '收拾书房'
    });
    const service = createApprovalServiceForVault(vaultPath, {
      id: () => 'prop_slug_task',
      now: () => new Date('2026-05-14T03:45:43.000Z'),
      emitActivity: () => undefined
    });

    const submitted = await service.submit({
      type: 'new_task',
      submitted_by: 'agent',
      submitted_by_agent_run: 'run_slug',
      subject: 'New task: QA conversation artifact task',
      payload: {
        project_uid: 'clean-shufang',
        title: 'QA conversation artifact task',
        execution_mode: 'assisted'
      }
    });

    const resolved = await service.resolve(submitted.id, {
      status: 'approved',
      resolution_source: 'inbox'
    });
    const taskPath = (resolved.proposal.result as { taskPath: string }).taskPath;
    const parsed = frontmatter.read(await fs.readFile(taskPath, 'utf8')).data;

    expect(parsed['project_uid']).toBe(project.uid);
    expect(parsed['execution_mode']).toBe('assisted');
    expect(parsed['execution_strategy']).toBe('manual');
  });
});
