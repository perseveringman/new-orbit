import { describe, expect, it } from 'vitest';
import { getTerminalShortcutAction } from '../src/renderer/src/components/Terminal/terminalHotkeys';

describe('terminal hotkeys', () => {
  it('maps cmd+d to split right', () => {
    expect(
      getTerminalShortcutAction({
        key: 'd',
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false
      })
    ).toBe('split-right');
  });

  it('maps cmd+shift+d to split down even when the browser reports a lowercase key', () => {
    expect(
      getTerminalShortcutAction({
        key: 'd',
        metaKey: true,
        ctrlKey: false,
        shiftKey: true,
        altKey: false
      })
    ).toBe('split-down');
  });
});
