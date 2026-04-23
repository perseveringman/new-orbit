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
