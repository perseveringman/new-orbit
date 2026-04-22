import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import { nanoid } from 'nanoid';
import { TerminalPane } from './TerminalPane';
import type { TerminalPaneHandle } from './TerminalPane';
import { disposeSession } from './sessionRegistry';
import { getTerminalShortcutAction } from './terminalHotkeys';
import {
  getLeafWrapperStyle,
  getPrimarySplitSectionStyle,
  getSecondarySplitSectionStyle
} from './terminalLayout';
import {
  type PaneNode,
  findPath,
  firstLeaf,
  getAllLeafIds,
  insertSplit,
  lastLeaf,
  deriveClosePaneResult
} from './terminalTree';

// ─── Data model ─────────────────────────────────────────────────────────────

interface TabState {
  id: string;
  title: string;
  root: PaneNode;
  focusedLeafId: string;
  zoomedLeafId: string | null;
}

interface ManagerState {
  tabs: TabState[];
  activeTabId: string;
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function storageKey(projectUid: string): string {
  return `orbit.termmgr.${projectUid}`;
}

function loadState(projectUid: string): ManagerState | null {
  try {
    const raw = localStorage.getItem(storageKey(projectUid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ManagerState;
    // Basic validation
    if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function makeLeafId(): string {
  return nanoid(8);
}

function makeTabId(): string {
  return nanoid(8);
}

function defaultState(): ManagerState {
  const leafId = makeLeafId();
  const tabId = makeTabId();
  return {
    tabs: [
      {
        id: tabId,
        title: 'Terminal 1',
        root: { kind: 'leaf', id: leafId },
        focusedLeafId: leafId,
        zoomedLeafId: null
      }
    ],
    activeTabId: tabId
  };
}

// ─── State update helpers ────────────────────────────────────────────────────

function updateTab(state: ManagerState, tabId: string, patch: Partial<TabState>): ManagerState {
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t))
  };
}

// ─── SplitNode shared props ───────────────────────────────────────────────────

interface SplitNodeSharedProps {
  projectUid: string;
  cwd: string;
  dark?: boolean;
  env?: Record<string, string>;
  focusedLeafId: string;
  zoomedLeafId: string | null;
  onFocusLeaf(leafId: string): void;
  onPersist(): void;
  paneRefs: React.MutableRefObject<Map<string, React.RefObject<TerminalPaneHandle>>>;
}

interface SplitNodeProps extends SplitNodeSharedProps {
  node: PaneNode;
  onNodeChange(newNode: PaneNode): void;
}

interface LeafPaneProps extends SplitNodeSharedProps {
  node: Extract<PaneNode, { kind: 'leaf' }>;
}

function LeafPane({ node, projectUid, cwd, dark, env, focusedLeafId, zoomedLeafId, onFocusLeaf, paneRefs }: LeafPaneProps): JSX.Element {
  const sessionKey = `${projectUid}::${node.id}`;
  const isFocused = node.id === focusedLeafId;
  const isZoomed = node.id === zoomedLeafId;

  if (!paneRefs.current.has(sessionKey)) {
    paneRefs.current.set(sessionKey, { current: null });
  }

  const wrapperStyle = getLeafWrapperStyle(isZoomed);

  return (
    <div
      data-pane-id={node.id}
      style={wrapperStyle}
      className={isFocused && !isZoomed ? 'ring-1 ring-inset ring-sky-400/60' : undefined}
      onMouseDown={() => onFocusLeaf(node.id)}
    >
      <TerminalPane
        ref={paneRefs.current.get(sessionKey)!}
        cwd={cwd}
        sessionKey={sessionKey}
        dark={dark}
        env={env}
        onFocus={() => onFocusLeaf(node.id)}
      />
    </div>
  );
}

interface SplitPaneProps extends SplitNodeSharedProps {
  node: Extract<PaneNode, { kind: 'split' }>;
  onNodeChange(newNode: PaneNode): void;
}

function SplitPane({ node, onNodeChange, onPersist, ...shared }: SplitPaneProps): JSX.Element {
  const [localRatio, setLocalRatio] = useState(node.ratio);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const latestRatio = useRef(localRatio);
  latestRatio.current = localRatio;

  useEffect(() => {
    setLocalRatio(node.ratio);
  }, [node.ratio]);

  function handlePointerDown(e: React.PointerEvent): void {
    e.preventDefault();
    isDragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent): void {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const raw =
      node.dir === 'row'
        ? (e.clientX - rect.left) / rect.width
        : (e.clientY - rect.top) / rect.height;
    const clamped = Math.max(0.1, Math.min(0.9, raw));
    setLocalRatio(clamped);
  }

  function handlePointerUp(e: React.PointerEvent): void {
    if (!isDragging.current) return;
    isDragging.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    const finalRatio = latestRatio.current;
    onNodeChange({ ...node, ratio: finalRatio });
    onPersist();
  }

  const isRow = node.dir === 'row';

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: isRow ? 'row' : 'column',
        flex: 1,
        minWidth: 0,
        minHeight: 0
      }}
    >
      <div style={getPrimarySplitSectionStyle(localRatio)}>
        <SplitNode
          node={node.a}
          onNodeChange={(newA) => onNodeChange({ ...node, a: newA })}
          onPersist={onPersist}
          {...shared}
        />
      </div>
      <div
        className={
          isRow
            ? 'w-1 shrink-0 cursor-col-resize bg-neutral-200 hover:bg-sky-400 dark:bg-neutral-800 dark:hover:bg-sky-500'
            : 'h-1 shrink-0 cursor-row-resize bg-neutral-200 hover:bg-sky-400 dark:bg-neutral-800 dark:hover:bg-sky-500'
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      <div style={getSecondarySplitSectionStyle()}>
        <SplitNode
          node={node.b}
          onNodeChange={(newB) => onNodeChange({ ...node, b: newB })}
          onPersist={onPersist}
          {...shared}
        />
      </div>
    </div>
  );
}

function SplitNode({ node, onNodeChange, ...shared }: SplitNodeProps): JSX.Element {
  if (node.kind === 'leaf') {
    return <LeafPane node={node} {...shared} />;
  }
  return <SplitPane node={node} onNodeChange={onNodeChange} {...shared} />;
}

// ─── TerminalManager ──────────────────────────────────────────────────────────

export interface TerminalManagerHandle {
  focusActive(): void;
}

interface TerminalManagerProps {
  projectUid: string;
  cwd: string;
  dark?: boolean;
  env?: Record<string, string>;
}

export const TerminalManager = forwardRef<TerminalManagerHandle, TerminalManagerProps>(
  function TerminalManager({ projectUid, cwd, dark, env }, ref) {
    const [state, setState] = useState<ManagerState>(() => {
      return loadState(projectUid) ?? defaultState();
    });
    const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const managerRootRef = useRef<HTMLDivElement>(null);
    const paneRefs = useRef<Map<string, React.RefObject<TerminalPaneHandle>>>(new Map());
    const stateRef = useRef(state);
    stateRef.current = state;

    // ── Persistence ────────────────────────────────────────────────────────
    const persist = useCallback(() => {
      try {
        localStorage.setItem(storageKey(projectUid), JSON.stringify(stateRef.current));
      } catch {
        /* ignore */
      }
    }, [projectUid]);

    // Reload state when projectUid changes
    useEffect(() => {
      setState(loadState(projectUid) ?? defaultState());
    }, [projectUid]);

    // ── Refit on tab switch ────────────────────────────────────────────────
    useEffect(() => {
      const tab = stateRef.current.tabs.find((t) => t.id === state.activeTabId);
      if (!tab) return;
      const leafIds = getAllLeafIds(tab.root);
      requestAnimationFrame(() => {
        for (const leafId of leafIds) {
          const key = `${projectUid}::${leafId}`;
          paneRefs.current.get(key)?.current?.refit();
        }
        const focusKey = `${projectUid}::${tab.focusedLeafId}`;
        paneRefs.current.get(focusKey)?.current?.focus();
      });
    }, [state.activeTabId, projectUid]);

    // ── Imperative handle ──────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      focusActive() {
        const tab = stateRef.current.tabs.find((t) => t.id === stateRef.current.activeTabId);
        if (!tab) return;
        const key = `${projectUid}::${tab.focusedLeafId}`;
        paneRefs.current.get(key)?.current?.focus();
      }
    }));

    // ── Core operations ───────────────────────────────────────────────────

    function newTab(): void {
      const leafId = makeLeafId();
      const tabId = makeTabId();
      const count = stateRef.current.tabs.length + 1;
      const newTabState: TabState = {
        id: tabId,
        title: `Terminal ${count}`,
        root: { kind: 'leaf', id: leafId },
        focusedLeafId: leafId,
        zoomedLeafId: null
      };
      setState((prev) => {
        const next = { tabs: [...prev.tabs, newTabState], activeTabId: tabId };
        stateRef.current = next;
        return next;
      });
      persist();
    }

    function closeTab(tabId: string): void {
      const tab = stateRef.current.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      // Dispose all PTYs in this tab
      const leafIds = getAllLeafIds(tab.root);
      for (const leafId of leafIds) {
        void disposeSession(`${projectUid}::${leafId}`);
      }
      setState((prev) => {
        let { tabs, activeTabId } = prev;
        tabs = tabs.filter((t) => t.id !== tabId);
        // Ensure at least one tab
        if (tabs.length === 0) {
          const leafId = makeLeafId();
          const newId = makeTabId();
          tabs = [
            {
              id: newId,
              title: 'Terminal 1',
              root: { kind: 'leaf', id: leafId },
              focusedLeafId: leafId,
              zoomedLeafId: null
            }
          ];
          activeTabId = newId;
        } else if (activeTabId === tabId) {
          activeTabId = tabs[0].id;
        }
        const next = { tabs, activeTabId };
        stateRef.current = next;
        return next;
      });
      persist();
    }

    function setActiveTabState(tabId: string): void {
      setState((prev) => {
        if (prev.activeTabId === tabId) return prev;
        const next = { ...prev, activeTabId: tabId };
        stateRef.current = next;
        return next;
      });
    }

    function setFocus(tabId: string, leafId: string): void {
      setState((prev) => {
        const next = updateTab(prev, tabId, { focusedLeafId: leafId });
        stateRef.current = next;
        return next;
      });
    }

    function splitPane(leafId: string, dir: 'row' | 'col'): void {
      const cur = stateRef.current;
      const tab = cur.tabs.find((t) => t.id === cur.activeTabId);
      if (!tab) return;
      const newLeafId = makeLeafId();
      const newRoot = insertSplit(tab.root, leafId, dir, newLeafId);
      setState((prev) => {
        const next = updateTab(prev, tab.id, {
          root: newRoot,
          focusedLeafId: newLeafId,
          zoomedLeafId: null
        });
        stateRef.current = next;
        return next;
      });
      persist();
    }

    function closePane(leafId: string): void {
      const cur = stateRef.current;
      const tab = cur.tabs.find((t) => t.id === cur.activeTabId);
      if (!tab) return;

      void disposeSession(`${projectUid}::${leafId}`);
      const result = deriveClosePaneResult(tab.root, leafId, tab.zoomedLeafId);

      if (result.root === null || result.focusedLeafId === null) {
        // Last leaf — close the tab
        closeTab(tab.id);
        return;
      }
      const nextRoot = result.root;
      const nextFocusedLeafId = result.focusedLeafId;
      setState((prev) => {
        const next = updateTab(prev, tab.id, {
          root: nextRoot,
          focusedLeafId: nextFocusedLeafId,
          zoomedLeafId: result.zoomedLeafId
        });
        stateRef.current = next;
        return next;
      });
      persist();
      requestAnimationFrame(() => {
        paneRefs.current.get(`${projectUid}::${nextFocusedLeafId}`)?.current?.focus();
      });
    }

    function renameTab(tabId: string, title: string): void {
      setState((prev) => {
        const next = updateTab(prev, tabId, { title });
        stateRef.current = next;
        return next;
      });
      persist();
    }

    function toggleZoom(tabId: string): void {
      const tab = stateRef.current.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const newZoomed = tab.zoomedLeafId === tab.focusedLeafId ? null : tab.focusedLeafId;
      setState((prev) => {
        const next = updateTab(prev, tabId, { zoomedLeafId: newZoomed });
        stateRef.current = next;
        return next;
      });
    }

    // ── Focus direction (ancestor backtrack algorithm) ─────────────────────
    function focusDirection(tabId: string, direction: 'left' | 'right' | 'up' | 'down'): void {
      const tab = stateRef.current.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const splitDir = direction === 'left' || direction === 'right' ? 'row' : 'col';
      const path = findPath(tab.root, tab.focusedLeafId);
      if (!path) return;

      // Walk path from closest ancestor to root
      for (let i = path.length - 1; i >= 0; i--) {
        const { split, branch } = path[i];
        if (split.dir !== splitDir) continue;

        if ((direction === 'left' || direction === 'up') && branch === 'b') {
          const newLeafId = lastLeaf(split.a);
          setFocus(tabId, newLeafId);
          requestAnimationFrame(() => {
            paneRefs.current.get(`${projectUid}::${newLeafId}`)?.current?.focus();
          });
          return;
        }
        if ((direction === 'right' || direction === 'down') && branch === 'a') {
          const newLeafId = firstLeaf(split.b);
          setFocus(tabId, newLeafId);
          requestAnimationFrame(() => {
            paneRefs.current.get(`${projectUid}::${newLeafId}`)?.current?.focus();
          });
          return;
        }
      }
    }

    function prevTab(): void {
      const { tabs, activeTabId } = stateRef.current;
      const idx = tabs.findIndex((t) => t.id === activeTabId);
      if (idx > 0) setActiveTabState(tabs[idx - 1].id);
    }

    function nextTab(): void {
      const { tabs, activeTabId } = stateRef.current;
      const idx = tabs.findIndex((t) => t.id === activeTabId);
      if (idx < tabs.length - 1) setActiveTabState(tabs[idx + 1].id);
    }

    // ── Keyboard handler ────────────────────────────────────────────────────
    function handleKey(e: React.KeyboardEvent): void {
      const root = managerRootRef.current;
      if (!root || !root.contains(document.activeElement)) return;

      const cur = stateRef.current;
      const activeTab = cur.tabs.find((t) => t.id === cur.activeTabId);
      if (!activeTab) return;
      const action = getTerminalShortcutAction(e);
      if (!action) return;

      e.preventDefault();
      e.stopPropagation();

      switch (action) {
        case 'new-tab':
          newTab();
          return;
        case 'close-pane':
          closePane(activeTab.focusedLeafId);
          return;
        case 'split-right':
          splitPane(activeTab.focusedLeafId, 'row');
          return;
        case 'split-down':
          splitPane(activeTab.focusedLeafId, 'col');
          return;
        case 'focus-left':
          focusDirection(activeTab.id, 'left');
          return;
        case 'focus-right':
          focusDirection(activeTab.id, 'right');
          return;
        case 'focus-up':
          focusDirection(activeTab.id, 'up');
          return;
        case 'focus-down':
          focusDirection(activeTab.id, 'down');
          return;
        case 'toggle-zoom':
          toggleZoom(activeTab.id);
          return;
        case 'prev-tab':
          prevTab();
          return;
        case 'next-tab':
          nextTab();
          return;
        default: {
          if (action.startsWith('switch-tab-')) {
            const idx = parseInt(action.slice('switch-tab-'.length), 10) - 1;
            if (idx < cur.tabs.length) {
              setActiveTabState(cur.tabs[idx].id);
            }
          }
        }
      }
    }

    // ── Rename helpers ──────────────────────────────────────────────────────
    function startRename(tab: TabState): void {
      setRenamingTabId(tab.id);
      setRenameValue(tab.title);
    }

    function commitRename(): void {
      if (renamingTabId && renameValue.trim()) {
        renameTab(renamingTabId, renameValue.trim());
      }
      setRenamingTabId(null);
    }

    // ── Render ───────────────────────────────────────────────────────────────
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0];

    return (
      <div
        ref={managerRootRef}
        data-orbit-term-manager
        tabIndex={0}
        onKeyDown={handleKey}
        className="flex flex-1 min-h-0 min-w-0 flex-col outline-none"
      >
        {/* Tab bar */}
        <div className="flex shrink-0 items-center border-b border-neutral-200 dark:border-neutral-800 text-xs overflow-x-auto bg-neutral-50 dark:bg-neutral-900">
          {state.tabs.map((tab, idx) => (
            <div key={tab.id} className="flex items-center">
              {renamingTabId === tab.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenamingTabId(null);
                  }}
                  className="mx-1 w-24 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1 py-0.5 text-xs"
                />
              ) : (
                <button
                  onDoubleClick={() => startRename(tab)}
                  onClick={() => setActiveTabState(tab.id)}
                  onMouseDown={(e) => {
                    if (e.button === 1) {
                      e.preventDefault();
                      closeTab(tab.id);
                    }
                  }}
                  className={`group flex items-center gap-1 px-3 py-1.5 whitespace-nowrap border-r border-neutral-200 dark:border-neutral-800 ${
                    tab.id === state.activeTabId
                      ? 'bg-white dark:bg-neutral-950 font-medium text-neutral-900 dark:text-neutral-100'
                      : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  <span>{idx + 1}. {tab.title}</span>
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 leading-none"
                  >
                    ×
                  </span>
                </button>
              )}
            </div>
          ))}
          <button
            onClick={newTab}
            className="px-3 py-1.5 shrink-0 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            +
          </button>
        </div>

        {/* Pane area — all tabs kept in DOM, inactive hidden */}
        <div className="relative flex-1 min-h-0 min-w-0">
          {state.tabs.map((tab) => (
            <div
              key={tab.id}
              style={{ display: tab.id === state.activeTabId ? 'flex' : 'none' }}
              className="absolute inset-0 flex min-h-0 min-w-0"
            >
              <SplitNode
                node={tab.root}
                onNodeChange={(newRoot) => {
                  setState((prev) => {
                    const next = updateTab(prev, tab.id, { root: newRoot });
                    stateRef.current = next;
                    return next;
                  });
                }}
                projectUid={projectUid}
                cwd={cwd}
                dark={dark}
                env={env}
                focusedLeafId={tab.focusedLeafId}
                zoomedLeafId={tab.zoomedLeafId}
                onFocusLeaf={(leafId) => {
                  setFocus(tab.id, leafId);
                  requestAnimationFrame(() => {
                    paneRefs.current.get(`${projectUid}::${leafId}`)?.current?.focus();
                  });
                }}
                onPersist={persist}
                paneRefs={paneRefs}
              />
            </div>
          ))}
        </div>

        {/* Status hint */}
        {activeTab && (
          <div className="flex shrink-0 items-center gap-3 border-t border-neutral-200 dark:border-neutral-800 px-3 py-0.5 text-[10px] text-neutral-400">
            <span>⌘D split right · ⌘⇧D split down · ⌘W close · ⌘T new tab · ⌘⇧↩ zoom</span>
          </div>
        )}
      </div>
    );
  }
);
