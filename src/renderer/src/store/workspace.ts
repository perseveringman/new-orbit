import { create } from 'zustand';
import type { AppSettings, Theme, VaultInfo } from '@shared/types';
import type { AreaSummaryDTO, ProjectSummaryDTO } from '@shared/ipc';
import { DEFAULT_APP_SETTINGS } from '@shared/schemas';

interface WorkspaceState {
  vault: VaultInfo | null;
  settings: AppSettings;
  loading: boolean;
  error: string | null;

  // R2 additions
  visionExcerpt: string | null;
  activeProjectUid: string | null;
  projects: ProjectSummaryDTO[];
  areas: AreaSummaryDTO[];

  init(): Promise<void>;
  openVault(): Promise<void>;
  createVault(): Promise<void>;
  closeVault(): Promise<void>;
  setTheme(theme: Theme): Promise<void>;
  updateSettings(partial: Partial<AppSettings>): Promise<void>;

  refreshVision(): Promise<void>;
  refreshProjects(): Promise<ProjectSummaryDTO[]>;
  refreshAreas(): Promise<AreaSummaryDTO[]>;
  setActiveProjectUid(uid: string | null): void;
}

const DEFAULT_SETTINGS: AppSettings = { ...DEFAULT_APP_SETTINGS };

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  vault: null,
  settings: DEFAULT_SETTINGS,
  loading: true,
  error: null,

  visionExcerpt: null,
  activeProjectUid: null,
  projects: [],
  areas: [],

  async init() {
    try {
      const [settings, vault] = await Promise.all([
        window.orbit.settings.get(),
        window.orbit.workspace.current()
      ]);
      set({ settings, vault, loading: false, error: null });
      applyTheme(settings.theme);
      if (vault) {
        void get().refreshVision();
        void get().refreshProjects();
        void get().refreshAreas();
      }
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
    }
  },

  async openVault() {
    const res = await window.orbit.workspace.pickAndOpen();
    if (res.ok) {
      set({ vault: res.vault, error: null });
      void get().refreshVision();
      void get().refreshProjects();
      void get().refreshAreas();
    } else if (res.reason !== 'cancelled') set({ error: res.message ?? res.reason });
  },

  async createVault() {
    const res = await window.orbit.workspace.createNew();
    if (res.ok) {
      set({ vault: res.vault, error: null });
      void get().refreshVision();
      void get().refreshProjects();
      void get().refreshAreas();
    } else if (res.reason !== 'cancelled') set({ error: res.message ?? res.reason });
  },

  async closeVault() {
    await window.orbit.workspace.close();
    set({ vault: null, visionExcerpt: null, projects: [], areas: [], activeProjectUid: null });
  },

  async setTheme(theme: Theme) {
    const next = await window.orbit.settings.setTheme(theme);
    set({ settings: next });
    applyTheme(theme);
  },

  async updateSettings(partial: Partial<AppSettings>) {
    const next = await window.orbit.settings.update(partial);
    set({ settings: next });
    if (partial.theme) applyTheme(next.theme);
  },

  async refreshVision() {
    try {
      const v = await window.orbit.vision.get();
      set({ visionExcerpt: v.exists ? v.excerpt : null });
    } catch {
      set({ visionExcerpt: null });
    }
  },

  async refreshProjects() {
    try {
      const list = await window.orbit.project.list();
      set({ projects: list });
      return list;
    } catch {
      set({ projects: [] });
      return [];
    }
  },

  async refreshAreas() {
    try {
      const list = await window.orbit.area.list();
      set({ areas: list });
      return list;
    } catch {
      set({ areas: [] });
      return [];
    }
  },

  setActiveProjectUid(uid: string | null) {
    set({ activeProjectUid: uid });
  }
}));

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    const mq = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true;
    return mq ? 'dark' : 'light';
  }
  return theme;
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const resolved = resolveTheme(theme);
  root.setAttribute('data-theme', resolved);
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

// Track system color-scheme changes once, in case the user picked 'system'.
if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener?.('change', () => {
    const st = useWorkspace.getState().settings;
    if (st.theme === 'system') applyTheme('system');
  });
}
