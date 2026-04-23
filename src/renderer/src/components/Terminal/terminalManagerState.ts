interface StoredTabState {
  id: string;
  title: string;
  root: StoredPaneNode;
}

type StoredPaneNode =
  | { kind: 'leaf'; id: string }
  | { kind: 'split'; a: StoredPaneNode; b: StoredPaneNode };

interface StoredManagerState {
  tabs: StoredTabState[];
  activeTabId: string;
}

type TerminalManagerStorage = Pick<Storage, 'getItem' | 'setItem'>;

function storageKey(projectUid: string): string {
  return `orbit.termmgr.${projectUid}`;
}

function tabContainsPane(node: StoredPaneNode, paneId: string): boolean {
  if (node.kind === 'leaf') return node.id === paneId;
  return tabContainsPane(node.a, paneId) || tabContainsPane(node.b, paneId);
}

function readStoredManagerState(
  projectUid: string,
  storage: Pick<Storage, 'getItem'> | null | undefined
): StoredManagerState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(storageKey(projectUid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredManagerState;
    return Array.isArray(parsed.tabs) ? parsed : null;
  } catch {
    return null;
  }
}

export function getOrCreateStoredTerminalManagerState<T extends { tabs: unknown[] }>(
  projectUid: string,
  createDefault: () => T,
  isStoredState: (value: unknown) => value is T,
  storage: TerminalManagerStorage | null | undefined =
    typeof globalThis !== 'undefined' && 'localStorage' in globalThis
      ? globalThis.localStorage
      : null
): T {
  const existing = readStoredManagerState(projectUid, storage);
  if (existing && isStoredState(existing)) return existing;
  const next = createDefault();
  if (storage) {
    try {
      storage.setItem(storageKey(projectUid), JSON.stringify(next));
    } catch {
      // ignore storage write errors and still return the in-memory default
    }
  }
  return next;
}

export function getStoredTerminalTitle(
  projectUid: string,
  paneId: string,
  storage: Pick<Storage, 'getItem'> | null | undefined =
    typeof globalThis !== 'undefined' && 'localStorage' in globalThis
      ? globalThis.localStorage
      : null
): string | undefined {
  const state = readStoredManagerState(projectUid, storage);
  if (!state) return undefined;
  return state.tabs.find((tab) => tabContainsPane(tab.root, paneId))?.title;
}
