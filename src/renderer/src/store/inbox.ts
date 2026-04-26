import { create } from 'zustand';
import { summarizeInboxCounts, type InboxCountSummary, type InboxEvent, type InboxItem } from '@shared/inbox';

interface InboxRendererState {
  items: InboxItem[];
  counts: InboxCountSummary;
  loading: boolean;
  error: string | null;
  unsubscribe: (() => void) | null;
  init(): void;
  teardown(): void;
  refresh(): Promise<void>;
}

let refreshSeq = 0;

function defaultCounts(): InboxCountSummary {
  return summarizeInboxCounts([]);
}

function applyInboxEvent(items: InboxItem[], event: InboxEvent): InboxItem[] {
  const next = items.filter((item) => item.id !== event.item.id);
  if (event.type === 'archived' || event.type === 'dismissed' || event.type === 'resolved') {
    return [event.item, ...next];
  }
  return [event.item, ...next];
}

export const useInbox = create<InboxRendererState>((set, get) => ({
  items: [],
  counts: defaultCounts(),
  loading: false,
  error: null,
  unsubscribe: null,
  init() {
    if (typeof window === 'undefined' || get().unsubscribe) return;
    const off = window.orbit.inbox.onEvent((event) => {
      set((state) => {
        const items = applyInboxEvent(state.items, event);
        return {
          items,
          counts: summarizeInboxCounts(items)
        };
      });
      void get().refresh();
    });
    set({ unsubscribe: off });
    void get().refresh();
  },
  teardown() {
    get().unsubscribe?.();
    set({ unsubscribe: null });
  },
  async refresh() {
    if (typeof window === 'undefined') return;
    const seq = ++refreshSeq;
    set({ loading: true, error: null });
    try {
      const result = await window.orbit.inbox.list({ includeArchived: true });
      if (seq !== refreshSeq) return;
      set({
        items: result.items,
        counts: result.counts,
        loading: false,
        error: null
      });
    } catch (caught) {
      if (seq !== refreshSeq) return;
      set({
        loading: false,
        error: (caught as Error).message
      });
    }
  }
}));
