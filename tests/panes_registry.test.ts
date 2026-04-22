import { beforeEach, describe, expect, test } from 'vitest';
import { _resetRegistry, getPane, listPanes, registerPane } from '../src/renderer/src/lib/panes/registry';

describe('pane registry', () => {
  beforeEach(() => {
    _resetRegistry();
  });

  test('registers and retrieves a pane renderer', () => {
    const renderer = {
      kind: 'terminal' as const,
      defaultData: () => ({ cwd: '/workspace' }),
      defaultTitle: (data: { cwd: string }) => `Terminal ${data.cwd}`
    };

    registerPane(renderer);

    expect(getPane('terminal')).toBe(renderer);
  });

  test('list includes all registered panes', () => {
    const terminal = { kind: 'terminal' as const };
    const diff = { kind: 'diff' as const };

    registerPane(terminal);
    registerPane(diff);

    expect(listPanes()).toEqual([terminal, diff]);
  });

  test('duplicate kinds overwrite the previous renderer', () => {
    const original = { kind: 'terminal' as const, defaultTitle: () => 'Original' };
    const replacement = { kind: 'terminal' as const, defaultTitle: () => 'Replacement' };

    registerPane(original);
    registerPane(replacement);

    expect(getPane('terminal')).toBe(replacement);
    expect(listPanes()).toEqual([replacement]);
  });

  test('reset empties the registry', () => {
    registerPane({ kind: 'terminal' as const });

    _resetRegistry();

    expect(getPane('terminal')).toBeUndefined();
    expect(listPanes()).toEqual([]);
  });
});
