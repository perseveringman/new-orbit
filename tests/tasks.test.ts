import { describe, expect, it } from 'vitest';
import { parseInlineTasks, tasksOfFile } from '../src/main/tasks';
import { applyInlineTaskStatus, setInlineTaskStatus } from '../src/main/task_mutate';

describe('inline task parsing', () => {
  it('parses unchecked and checked items and status comments', () => {
    const body = [
      '- [ ] first',
      '  - [x] nested done',
      'some text',
      '- [ ] doing now <!-- orbit:status=doing -->',
      '- [ ] blocked by X  <!-- orbit:status=blocked -->',
      'not a task'
    ].join('\n');
    const parsed = parseInlineTasks(body);
    expect(parsed).toEqual([
      { line: 1, status: 'backlog', title: 'first' },
      { line: 2, status: 'done', title: 'nested done' },
      { line: 4, status: 'doing', title: 'doing now' },
      { line: 5, status: 'blocked', title: 'blocked by X' }
    ]);
  });

  it('tasksOfFile emits file + inline tasks with owner uid inference', () => {
    const rel = '01_Projects/foo.md';
    const abs = '/tmp/vault/01_Projects/foo.md';
    const content =
      '---\nuid: ABCDEFGH1234\ntype: project\ntitle: Foo\nstatus: active\n---\n' +
      '- [ ] first task\n' +
      '- [x] done task\n';
    const list = tasksOfFile(abs, rel, content);
    // No file task because the file is a project, not a task.
    expect(list.filter((t) => t.source === 'file')).toHaveLength(0);
    const inline = list.filter((t) => t.source === 'inline');
    expect(inline.map((t) => t.title)).toEqual(['first task', 'done task']);
    expect(inline.every((t) => t.project_uid === 'ABCDEFGH1234')).toBe(true);
    expect(inline[0]?.status).toBe('backlog');
    expect(inline[1]?.status).toBe('done');
    expect(inline[0]?.line).toBe(1);
    expect(inline[1]?.line).toBe(2);
  });

  it('tasksOfFile produces a file task when type === task', () => {
    const content =
       '---\nuid: TASKUID12345\ntype: task\ntitle: Buy beans\nstatus: todo\neffort: s\n---\n';
    const list = tasksOfFile('/x/y.md', '01_Projects/y.md', content);
    const file = list.find((t) => t.source === 'file');
    expect(file).toBeDefined();
    expect(file?.status).toBe('todo');
    expect(file?.effort).toBe('s');
    expect(file?.id).toBe('file:01_Projects/y.md');
  });
});

describe('inline task mutation', () => {
  it('toggles binary states and strips comments', () => {
    expect(setInlineTaskStatus('- [ ] a', 'done')).toBe('- [x] a');
    expect(setInlineTaskStatus('- [x] a', 'backlog')).toBe('- [ ] a');
    expect(setInlineTaskStatus('- [ ] a <!-- orbit:status=doing -->', 'done')).toBe(
      '- [x] a'
    );
  });

  it('writes a status comment for non-binary statuses', () => {
    expect(setInlineTaskStatus('- [ ] a', 'doing')).toBe(
      '- [ ] a <!-- orbit:status=doing -->'
    );
    expect(setInlineTaskStatus('- [ ] a <!-- orbit:status=todo -->', 'blocked')).toBe(
      '- [ ] a <!-- orbit:status=blocked -->'
    );
  });

  it('preserves indentation', () => {
    expect(setInlineTaskStatus('  - [ ] sub', 'done')).toBe('  - [x] sub');
  });

  it('applyInlineTaskStatus updates the right line', () => {
    const src = '# h\n- [ ] a\n- [ ] b\n';
    const out = applyInlineTaskStatus(src, 3, 'doing');
    expect(out).toBe('# h\n- [ ] a\n- [ ] b <!-- orbit:status=doing -->\n');
  });
});
