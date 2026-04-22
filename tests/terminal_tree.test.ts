import { describe, expect, it } from 'vitest';
import {
  type PaneNode,
  deriveClosePaneResult
} from '../src/renderer/src/components/Terminal/terminalTree';

describe('terminal tree', () => {
  it('focuses the remaining sibling after closing a pane', () => {
    const root: PaneNode = {
      kind: 'split',
      dir: 'row',
      ratio: 0.5,
      a: { kind: 'leaf', id: 'a' },
      b: { kind: 'leaf', id: 'b' }
    };

    expect(deriveClosePaneResult(root, 'a', null)).toEqual({
      root: { kind: 'leaf', id: 'b' },
      focusedLeafId: 'b',
      zoomedLeafId: null
    });
  });
});
