import { describe, expect, it } from 'vitest';
import type { TaskRecord } from '../src/shared/schemas';
import {
  buildDependencyGraph,
  detectAnyCycle,
  detectCycleForUpdate,
  dependencyTree,
  unmetDependencies
} from '../src/main/dependencies/graph';

function task(uid: string, depends_on: string[] = [], status: TaskRecord['status'] = 'todo'): TaskRecord {
  return {
    id: `file:${uid}`,
    source: 'file',
    status,
    title: uid,
    filePath: `/vault/${uid}.md`,
    relPath: `${uid}.md`,
    uid,
    depends_on
  };
}

describe('task dependency graph utilities', () => {
  it('builds forward and reverse dependency edges from depends_on', () => {
    const graph = buildDependencyGraph([task('a'), task('b', ['a']), task('c', ['b'])]);

    expect(graph.edges.get('c')).toEqual(['b']);
    expect([...(graph.reverseEdges.get('b') ?? [])]).toEqual(['c']);
  });

  it('detects an existing cycle in any task dependency graph', () => {
    const cycle = detectAnyCycle(buildDependencyGraph([task('a', ['c']), task('b', ['a']), task('c', ['b'])]));

    expect(cycle?.path).toEqual(['a', 'c', 'b', 'a']);
  });

  it('detects a cycle for a proposed depends_on update before writing', () => {
    const cycle = detectCycleForUpdate('a', ['c'], [task('a'), task('b', ['a']), task('c', ['b'])]);

    expect(cycle?.path).toEqual(['a', 'c', 'b', 'a']);
  });

  it('reports unmet dependencies and renders dependency trees', () => {
    const tasks = [task('a', [], 'done'), task('b', [], 'doing'), task('c', ['a', 'b', 'missing'])];
    const byUid = new Map(tasks.map((entry) => [entry.uid!, entry]));

    expect(unmetDependencies(tasks[2]!, byUid).map((dep) => [dep.uid, dep.reason])).toEqual([
      ['b', 'not_done'],
      ['missing', 'missing']
    ]);
    expect(dependencyTree('c', byUid).children.map((child) => child.uid)).toEqual([
      'a',
      'b',
      'missing'
    ]);
  });
});
