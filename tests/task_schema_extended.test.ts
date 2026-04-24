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
      execution_strategy: 'autonomous',
      origin: 'agent',
      created_by: 'agent:planner',
      owner_type: 'binding',
      owner_id: 'binding-1',
      claimed_at: '2026-04-25T00:00:00.000Z',
      active_run_id: 'run-1',
      role_binding_id: 'binding-1',
      recommended_role: 'executor',
      candidate_role_slugs: ['executor', 'reviewer'],
      pre_conditions: ['a', 'b'],
      priority: 'high',
      effort: 4
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.pre_conditions).toEqual(['a', 'b']);
      expect(r.data.effort).toBe(4);
      expect(r.data.owner_type).toBe('binding');
      expect(r.data.candidate_role_slugs).toEqual(['executor', 'reviewer']);
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
