import { create } from 'zustand';
import type { BacklinkItem, FileNode, FsEvent, SearchHit } from '@shared/types';

interface OpenFile {
  path: string;
  relPath: string;
  content: string;
  dirty: boolean;
}

interface FilesState {
  tree: FileNode | null;
  active: OpenFile | null;
  backlinks: BacklinkItem[];
  unsubscribe: (() => void) | null;
  toasts: { id: number; text: string }[];

  init(vaultPath: string): Promise<void>;
  teardown(): void;
  refreshTree(vaultPath: string): Promise<void>;
  openPath(absPath: string): Promise<void>;
  setContent(content: string): void;
  save(): Promise<void>;
  createFile(dirPath: string, filename: string): Promise<string>;
  rename(oldPath: string, newPath: string): Promise<void>;
  deletePath(absPath: string): Promise<void>;
  search(q: string): Promise<SearchHit[]>;
  toast(text: string): void;
  dismissToast(id: number): void;
}

let toastId = 0;

export const useFiles = create<FilesState>((set, get) => ({
  tree: null,
  active: null,
  backlinks: [],
  unsubscribe: null,
  toasts: [],

  async init(vaultPath: string) {
    get().teardown();
    await get().refreshTree(vaultPath);
    const off = window.orbit.fs.onEvent(async (ev: FsEvent) => {
      await get().refreshTree(vaultPath);
      if (ev.kind === 'rename' && ev.oldPath && get().active?.path === ev.oldPath) {
        set({
          active: {
            ...get().active!,
            path: ev.path,
            relPath: ev.relPath
          }
        });
        if (get().active) {
          const bl = await window.orbit.fs.backlinksOf(ev.path);
          set({ backlinks: bl });
        }
      } else if (ev.kind === 'change' && get().active?.path === ev.path) {
        // Re-read only if user has not edited locally.
        if (!get().active?.dirty) {
          const content = await window.orbit.fs.readFile(ev.path);
          set({ active: { ...get().active!, content } });
        }
      }
      if (get().active) {
        const bl = await window.orbit.fs.backlinksOf(get().active!.path);
        set({ backlinks: bl });
      }
    });
    set({ unsubscribe: off });
  },

  teardown() {
    get().unsubscribe?.();
    set({ unsubscribe: null, tree: null, active: null, backlinks: [] });
  },

  async refreshTree(vaultPath: string) {
    const tree = await window.orbit.fs.listTree(vaultPath);
    set({ tree });
  },

  async openPath(absPath: string) {
    const content = await window.orbit.fs.readFile(absPath);
    const bl = await window.orbit.fs.backlinksOf(absPath);
    set({
      active: {
        path: absPath,
        relPath: relativeFromTree(get().tree, absPath),
        content,
        dirty: false
      },
      backlinks: bl
    });
  },

  setContent(content: string) {
    const a = get().active;
    if (!a) return;
    set({ active: { ...a, content, dirty: true } });
  },

  async save() {
    const a = get().active;
    if (!a || !a.dirty) return;
    await window.orbit.fs.writeFile(a.path, a.content);
    set({ active: { ...a, dirty: false } });
  },

  async createFile(dirPath: string, filename: string) {
    const { path: abs } = await window.orbit.fs.createFile(dirPath, filename);
    await get().openPath(abs);
    return abs;
  },

  async rename(oldPath: string, newPath: string) {
    const res = await window.orbit.fs.rename(oldPath, newPath);
    if (get().active?.path === oldPath) await get().openPath(res.newPath);
    if (res.linksUpdated > 0) {
      get().toast(`${res.linksUpdated} link${res.linksUpdated === 1 ? '' : 's'} updated`);
    }
  },

  async deletePath(abs: string) {
    await window.orbit.fs.deleteFile(abs);
    if (get().active?.path === abs) set({ active: null, backlinks: [] });
  },

  async search(q: string) {
    return window.orbit.fs.search(q, { limit: 30 });
  },

  toast(text: string) {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, text }] });
    setTimeout(() => get().dismissToast(id), 3500);
  },

  dismissToast(id: number) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  }
}));

function relativeFromTree(tree: FileNode | null, abs: string): string {
  if (!tree) return abs;
  if (abs.startsWith(tree.path)) return abs.slice(tree.path.length + 1).replace(/\\/g, '/');
  return abs;
}
