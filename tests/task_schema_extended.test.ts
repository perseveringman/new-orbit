import { describe, it, expect } from 'vitest';
import { TaskFrontmatter } from '../src/shared/schemas';

describe('TaskFrontmatter (R3 extensions)', () => {
  it('parses the legacy shape unchanged (back-compat)', () => {
    const r = TaskFrontmatter.safeParse({
      uid: 't1',
      type: 'task',
      title: 'old',
      status: 'inbox',
      effort: 'm'
    });
    expect(r.success).toBe(true);
  });

  it('accepts the new optional fields', () => {
    const r = TaskFrontmatter.safeParse({
      uid: 't2',
      type: 'task',
      title: 'new',
      status: 'doing',
      git_branch: 'orbit/ghost/abc',
      worktree_path: '.orbit/worktrees/wt-1',
      pr_url: 'https://github.com/x/y/pull/1',
      execution_mode: 'agent',
      execution_strategy: 'autonomous',
      origin: 'agent',
      created_by: 'agent:planner',
      owner_type: 'binding',
      owner_id: 'binding-1',
      claimed_at: '2026-04-25T00:00:00.000Z',
      active_run_id: 'run-1',
      source_conversation_id: 'conv-1',
      conversation_ids: ['conv-1', 'conv-2'],
      approved_by: 'user',
      approved_at: '2026-04-26T00:00:00.000Z',
      proposed_by_agent_run: 'run-2',
      proposed_during_task: 'task-parent',
      proposal_id: 'proposal-1',
      approval_decision_note: 'Looks useful',
      role_binding_id: 'binding-1',
      recommended_role: 'executor',
      candidate_role_slugs: ['executor', 'reviewer'],
      pre_conditions: ['a', 'b'],
      depends_on: ['task-a'],
      derived_from: 'task-parent',
      priority: 'high',
      budget_limit: 12,
      effort: 4
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.pre_conditions).toEqual(['a', 'b']);
      expect(r.data.effort).toBe(4);
      expect(r.data.owner_type).toBe('binding');
      expect(r.data.execution_mode).toBe('agent');
      expect(r.data.source_conversation_id).toBe('conv-1');
      expect(r.data.conversation_ids).toEqual(['conv-1', 'conv-2']);
      expect(r.data.candidate_role_slugs).toEqual(['executor', 'reviewer']);
      expect(r.data.approved_by).toBe('user');
      expect(r.data.proposed_by_agent_run).toBe('run-2');
      expect(r.data.depends_on).toEqual(['task-a']);
      expect(r.data.derived_from).toBe('task-parent');
      expect(r.data.budget_limit).toBe(12);
    }
  });

  it('defaults v2 authorization and dependency fields for legacy tasks', () => {
    const r = TaskFrontmatter.safeParse({
      uid: 't2-defaults',
      type: 'task',
      title: 'legacy',
      status: 'todo',
      pre_conditions: ['legacy-parent'],
      generated_from_task_uid: 'legacy-source'
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.created_by).toBe('user');
      expect(r.data.approved_by).toBe('user');
      expect(r.data.approved_at).toBeNull();
      expect(r.data.proposed_by_agent_run).toBeNull();
      expect(r.data.proposed_during_task).toBeNull();
      expect(r.data.proposal_id).toBeNull();
      expect(r.data.approval_decision_note).toBeNull();
      expect(r.data.depends_on).toEqual([]);
      expect(r.data.derived_from).toBeNull();
      expect(r.data.pre_conditions).toEqual(['legacy-parent']);
      expect(r.data.generated_from_task_uid).toBe('legacy-source');
    }
  });

  it('rejects invalid execution_strategy', () => {
    const r = TaskFrontmatter.safeParse({
      uid: 't3',
      type: 'task',
      title: 'x',
      status: 'inbox',
      execution_strategy: 'rogue'
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid execution_mode', () => {
    const r = TaskFrontmatter.safeParse({
      uid: 't3-mode',
      type: 'task',
      title: 'x',
      status: 'todo',
      execution_mode: 'robot'
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid priority', () => {
    const r = TaskFrontmatter.safeParse({
      uid: 't4',
      type: 'task',
      title: 'x',
      status: 'inbox',
      priority: 'urgent'
    });
    expect(r.success).toBe(false);
  });

  it('normalizes legacy statuses to the new lifecycle', () => {
    const r = TaskFrontmatter.safeParse({
      uid: 't5',
      type: 'task',
      title: 'legacy',
      status: 'today'
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe('todo');
    }
  });
});
