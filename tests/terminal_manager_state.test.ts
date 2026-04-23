import { describe, expect, it } from 'vitest';
import { getOrCreateStoredTerminalManagerState } from '../src/renderer/src/components/Terminal/terminalManagerState';

describe('terminal manager state persistence', () => {
  it('persists the first default state so a project reuses the same pane ids after switching back', () => {
    const backing = new Map<string, string>();
    const storage = {
      getItem(key: string): string | null {
        return backing.get(key) ?? null;
      },
      setItem(key: string, value: string): void {
        backing.set(key, value);
      }
    } as Pick<Storage, 'getItem' | 'setItem'>;

    const initial = {
      tabs: [
        {
          id: 'tab-a',
          title: 'Terminal 1',
          root: { kind: 'leaf' as const, id: 'pane-a' },
          focusedLeafId: 'pane-a',
          zoomedLeafId: null
        }
      ],
      activeTabId: 'tab-a'
    };

    const reopened = {
      tabs: [
        {
          id: 'tab-b',
          title: 'Terminal 1',
          root: { kind: 'leaf' as const, id: 'pane-b' },
          focusedLeafId: 'pane-b',
          zoomedLeafId: null
        }
      ],
      activeTabId: 'tab-b'
    };

    const isManagerState = (
      value: unknown
    ): value is typeof initial => {
      if (!value || typeof value !== 'object') return false;
      const record = value as Record<string, unknown>;
      return Array.isArray(record.tabs) && typeof record.activeTabId === 'string';
    };

    const first = getOrCreateStoredTerminalManagerState(
      'project-a',
      () => initial,
      isManagerState,
      storage
    );
    const second = getOrCreateStoredTerminalManagerState(
      'project-a',
      () => reopened,
      isManagerState,
      storage
    );

    expect(first).toEqual(initial);
    expect(second).toEqual(initial);
    expect(second.tabs[0]?.root).toEqual({ kind: 'leaf', id: 'pane-a' });
  });
});
