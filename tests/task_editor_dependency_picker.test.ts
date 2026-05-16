import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TaskRecord } from '../src/shared/schemas';
import {
  TaskRelationPicker,
  describeDependencyState,
  inspectDependencyState,
  toggleTaskRelationValue
} from '../src/renderer/src/components/TaskEditor/TaskEditor';

function task(uid: string, title: string, status: TaskRecord['status']): TaskRecord {
  return {
    id: `file:${uid}`,
    uid,
    source: 'file',
    title,
    status,
    filePath: `/vault/${uid}.md`,
    relPath: `${uid}.md`,
    created_by: 'user',
    approved_by: 'user',
    depends_on: []
  };
}

describe('TaskEditor dependency helpers', () => {
  it('toggles relation values without duplicating entries', () => {
    expect(toggleTaskRelationValue([], 'task-a', true)).toEqual(['task-a']);
    expect(toggleTaskRelationValue(['task-a'], 'task-a', true)).toEqual(['task-a']);
    expect(toggleTaskRelationValue(['task-a', 'task-b'], 'task-a', false)).toEqual(['task-b']);
  });

  it('reports unmet and missing dependencies separately', () => {
    const state = inspectDependencyState(
      ['task-a', 'task-missing'],
      [task('task-a', 'Draft outline', 'doing'), task('task-b', 'Review outline', 'done')]
    );

    expect(state.unmet.map((entry) => entry.uid)).toEqual(['task-a']);
    expect(state.missing).toEqual(['task-missing']);
    expect(describeDependencyState(state)).toContain('Draft outline');
    expect(describeDependencyState(state)).toContain('task-missing');
  });

  it('renders dependency choices with task status context', () => {
    const html = renderToStaticMarkup(
      createElement(TaskRelationPicker, {
        all: [task('task-a', 'Draft outline', 'doing'), task('task-b', 'Review outline', 'done')],
        value: ['task-a'],
        onChange: () => undefined
      })
    );

    expect(html).toContain('Draft outline');
    expect(html).toContain('Review outline');
    expect(html).toContain('进行中');
    expect(html).toContain('checked');
  });
});
