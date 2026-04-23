import { create } from 'zustand';
import type { TaskRecord } from '@shared/schemas';
import {
  findSidebarIntentForPanel,
  resolveSidebarIntentTab,
  resolveSidebarPanelTab,
  type SidebarIntentId,
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
  focus: SidebarFocusState;
  memories: Partial<Record<SidebarSurfaceId, SidebarMemory>>;

  reset(): void;
  setSurface(surface: SidebarSurfaceId): void;
  selectIntent(intent: SidebarIntentId): void;
  selectPanel(panel: SidebarPanelId): void;
  setFocus(patch: Partial<SidebarFocusState>): void;
  openPanel(args: {
    panel: SidebarPanelId;
    focus?: Partial<SidebarFocusState>;
    surface?: SidebarSurfaceId;
    intent?: SidebarIntentId;
  }): void;
}

const DEFAULT_SURFACE: SidebarSurfaceId = 'editor';
const DEFAULT_INTENT = resolveSidebarIntentTab(DEFAULT_SURFACE, null);
const DEFAULT_PANEL = resolveSidebarPanelTab(DEFAULT_SURFACE, DEFAULT_INTENT, null);

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
  focus: createEmptyFocus(),
  memories: {
    [DEFAULT_SURFACE]: { intent: DEFAULT_INTENT, panel: DEFAULT_PANEL }
  },

  reset() {
    set({
      surface: DEFAULT_SURFACE,
      intent: DEFAULT_INTENT,
      panel: DEFAULT_PANEL,
      focus: createEmptyFocus(),
      memories: {
        [DEFAULT_SURFACE]: { intent: DEFAULT_INTENT, panel: DEFAULT_PANEL }
      }
    });
  },

  setSurface(surface) {
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
      memories: remember(state.memories, surface, resolvedIntent, panel)
    }));
  },

  selectPanel(panel) {
    const surface = get().surface;
    const intent = get().intent;
    const resolvedPanel = resolveSidebarPanelTab(surface, intent, panel);

    set((state) => ({
      panel: resolvedPanel,
      memories: remember(state.memories, surface, intent, resolvedPanel)
    }));
  },

  setFocus(patch) {
    set((state) => ({
      focus: {
        ...state.focus,
        ...patch
      }
    }));
  },

  openPanel({ panel, focus, surface, intent }) {
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
      focus: focus ? { ...state.focus, ...focus } : state.focus,
      memories: remember(state.memories, targetSurface, resolvedIntent, resolvedPanel)
    }));
  }
}));
