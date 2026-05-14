import { create } from 'zustand';
import type { TaskRecord } from '@shared/schemas';
import {
  findSidebarIntentForPanel,
  getSidebarDefaultWidth,
  resolveSidebarIntentTab,
  resolveSidebarPanelTab,
  type SidebarIntentId,
  type SidebarPaneMode,
  type SidebarPanelId,
  type SidebarSurfaceId
} from '../views/vaultRightSidebarModel';

export interface SidebarFocusState {
  task: TaskRecord | null;
  filePath: string | null;
  projectUid: string | null;
  sessionId: string | null;
  runId: string | null;
  worktreeId: string | null;
}

interface SidebarMemory {
  intent: SidebarIntentId;
  panel: SidebarPanelId;
}

interface SidebarState {
  surface: SidebarSurfaceId;
  intent: SidebarIntentId;
  panel: SidebarPanelId;
  paneMode: SidebarPaneMode;
  width: number;
  pinned: boolean;
  focus: SidebarFocusState;
  memories: Partial<Record<SidebarSurfaceId, SidebarMemory>>;

  reset(): void;
  setSurface(surface: SidebarSurfaceId): void;
  selectIntent(intent: SidebarIntentId): void;
  selectPanel(panel: SidebarPanelId): void;
  setPaneMode(mode: SidebarPaneMode): void;
  setWidth(width: number): void;
  setPinned(pinned: boolean): void;
  togglePinned(): void;
  setFocus(patch: Partial<SidebarFocusState>): void;
  openPanel(args: {
    panel: SidebarPanelId;
    focus?: Partial<SidebarFocusState>;
    surface?: SidebarSurfaceId;
    intent?: SidebarIntentId;
    origin?: 'auto' | 'user';
  }): void;
}

const DEFAULT_SURFACE: SidebarSurfaceId = 'editor';
const DEFAULT_INTENT = resolveSidebarIntentTab(DEFAULT_SURFACE, null);
const DEFAULT_PANEL = resolveSidebarPanelTab(DEFAULT_SURFACE, DEFAULT_INTENT, null);
const MIN_WIDTH = 300;
const MAX_WIDTH = 720;

function clampWidth(width: number): number {
  if (Number.isNaN(width)) return getSidebarDefaultWidth(DEFAULT_PANEL);
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
}

function createEmptyFocus(): SidebarFocusState {
  return {
    task: null,
    filePath: null,
    projectUid: null,
    sessionId: null,
    runId: null,
    worktreeId: null
  };
}

function remember(
  memories: Partial<Record<SidebarSurfaceId, SidebarMemory>>,
  surface: SidebarSurfaceId,
  intent: SidebarIntentId,
  panel: SidebarPanelId
): Partial<Record<SidebarSurfaceId, SidebarMemory>> {
  return {
    ...memories,
    [surface]: { intent, panel }
  };
}

export const useSidebar = create<SidebarState>((set, get) => ({
  surface: DEFAULT_SURFACE,
  intent: DEFAULT_INTENT,
  panel: DEFAULT_PANEL,
  paneMode: 'expanded',
  width: getSidebarDefaultWidth(DEFAULT_PANEL),
  pinned: false,
  focus: createEmptyFocus(),
  memories: {
    [DEFAULT_SURFACE]: { intent: DEFAULT_INTENT, panel: DEFAULT_PANEL }
  },

  reset() {
    set({
      surface: DEFAULT_SURFACE,
      intent: DEFAULT_INTENT,
      panel: DEFAULT_PANEL,
      paneMode: 'expanded',
      width: getSidebarDefaultWidth(DEFAULT_PANEL),
      pinned: false,
      focus: createEmptyFocus(),
      memories: {
        [DEFAULT_SURFACE]: { intent: DEFAULT_INTENT, panel: DEFAULT_PANEL }
      }
    });
  },

  setSurface(surface) {
    if (get().pinned) return;

    const memory = get().memories[surface];
    const intent = resolveSidebarIntentTab(surface, memory?.intent ?? null);
    const panel = resolveSidebarPanelTab(surface, intent, memory?.panel ?? null);

    set((state) => ({
      surface,
      intent,
      panel,
      memories: remember(state.memories, surface, intent, panel)
    }));
  },

  selectIntent(intent) {
    const surface = get().surface;
    const resolvedIntent = resolveSidebarIntentTab(surface, intent);
    const panel = resolveSidebarPanelTab(surface, resolvedIntent, get().panel);

    set((state) => ({
      intent: resolvedIntent,
      panel,
      paneMode: state.paneMode === 'hidden' ? 'expanded' : state.paneMode,
      memories: remember(state.memories, surface, resolvedIntent, panel)
    }));
  },

  selectPanel(panel) {
    const surface = get().surface;
    const intent = get().intent;
    const resolvedPanel = resolveSidebarPanelTab(surface, intent, panel);

    set((state) => ({
      panel: resolvedPanel,
      paneMode: 'expanded',
      memories: remember(state.memories, surface, intent, resolvedPanel)
    }));
  },

  setPaneMode(mode) {
    set({ paneMode: mode });
  },

  setWidth(width) {
    const clamped = clampWidth(width);
    set({ width: clamped });
  },

  setPinned(pinned) {
    set({ pinned });
  },

  togglePinned() {
    set((state) => ({ pinned: !state.pinned }));
  },

  setFocus(patch) {
    set((state) => ({
      focus: {
        ...state.focus,
        ...patch
      }
    }));
  },

  openPanel({ panel, focus, surface, intent, origin = 'user' }) {
    if (get().pinned && origin === 'auto') return;

    const targetSurface = surface ?? get().surface;
    const resolvedIntent = resolveSidebarIntentTab(
      targetSurface,
      intent ?? findSidebarIntentForPanel(targetSurface, panel)
    );
    const resolvedPanel = resolveSidebarPanelTab(targetSurface, resolvedIntent, panel);

    set((state) => ({
      surface: targetSurface,
      intent: resolvedIntent,
      panel: resolvedPanel,
      paneMode: 'expanded',
      focus: focus ? { ...state.focus, ...focus } : state.focus,
      memories: remember(state.memories, targetSurface, resolvedIntent, resolvedPanel)
    }));
  }
}));
