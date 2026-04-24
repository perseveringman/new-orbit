import { describe, expect, it } from 'vitest';
import { groupByStatus, moveTask, EMPTY_COLUMNS } from '../src/shared/kanban';
import type { TaskRecord } from '../src/shared/schemas';

function t(id: string, status: TaskRecord['status']): TaskRecord {
  return {
    id,
    source: 'inline',
    status,
    title: id,
    filePath: `/v/${id}.md`,
    relPath: `${id}.md`
  };
}

describe('kanban reducer', () => {
  it('groupByStatus partitions tasks into fixed columns', () => {
    const rows = [t('a', 'backlog'), t('b', 'doing'), t('c', 'backlog'), t('d', 'done')];
    const cols = groupByStatus(rows);
    expect(cols.backlog.map((x) => x.id)).toEqual(['a', 'c']);
    expect(cols.doing.map((x) => x.id)).toEqual(['b']);
    expect(cols.done.map((x) => x.id)).toEqual(['d']);
    expect(cols.waiting).toEqual([]);
    expect(cols.todo).toEqual([]);
    expect(cols.blocked).toEqual([]);
  });

  it('moveTask returns next list with the task promoted to target column', () => {
    const rows = [t('a', 'backlog'), t('b', 'doing')];
    const { next, moved } = moveTask(rows, 'a', 'todo');
    expect(moved?.status).toBe('todo');
    expect(next.find((x) => x.id === 'a')?.status).toBe('todo');
    expect(next).not.toBe(rows);
  });

  it('moveTask is a no-op when status already matches', () => {
    const rows = [t('a', 'doing')];
    const { next, moved } = moveTask(rows, 'a', 'doing');
    expect(moved).toBeNull();
    expect(next).toBe(rows);
  });

  it('moveTask is a no-op for unknown id', () => {
    const rows = [t('a', 'backlog')];
    const { next, moved } = moveTask(rows, 'zzz', 'todo');
    expect(moved).toBeNull();
    expect(next).toBe(rows);
  });

  it('EMPTY_COLUMNS returns every status key', () => {
    const c = EMPTY_COLUMNS();
    expect(Object.keys(c).sort()).toEqual(
      ['backlog', 'blocked', 'doing', 'done', 'todo', 'waiting'].sort()
    );
  });
});
