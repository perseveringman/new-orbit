import type { TerminalPaneAgentStatus } from './terminalAgentStatus';

export function upsertTerminalPaneStatus(
  statuses: Map<string, TerminalPaneAgentStatus>,
  leafId: string,
  status: TerminalPaneAgentStatus
): boolean {
  const previous = statuses.get(leafId);
  if (previous === status) return false;
  statuses.set(leafId, status);
  return true;
}

interface TerminalPaneStatusRegistry {
  get(sessionKey: string): TerminalPaneAgentStatus;
  set(sessionKey: string, status: TerminalPaneAgentStatus): void;
  clear(sessionKey: string): void;
  subscribe(sessionKey: string, listener: () => void): () => void;
  subscribeAll(listener: () => void): () => void;
}

export function createTerminalPaneStatusRegistry(): TerminalPaneStatusRegistry {
  const statuses = new Map<string, TerminalPaneAgentStatus>();
  const listeners = new Map<string, Set<() => void>>();
  const globalListeners = new Set<() => void>();

  function emit(sessionKey: string): void {
    for (const listener of listeners.get(sessionKey) ?? []) listener();
    for (const listener of globalListeners) listener();
  }

  return {
    get(sessionKey) {
      return statuses.get(sessionKey) ?? 'idle';
    },
    set(sessionKey, status) {
      if (!upsertTerminalPaneStatus(statuses, sessionKey, status)) return;
      emit(sessionKey);
    },
    clear(sessionKey) {
      if ((statuses.get(sessionKey) ?? 'idle') === 'idle') return;
      statuses.delete(sessionKey);
      emit(sessionKey);
    },
    subscribe(sessionKey, listener) {
      const set = listeners.get(sessionKey) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(sessionKey, set);
      return () => {
        const current = listeners.get(sessionKey);
        if (!current) return;
        current.delete(listener);
        if (current.size === 0) listeners.delete(sessionKey);
      };
    },
    subscribeAll(listener) {
      globalListeners.add(listener);
      return () => {
        globalListeners.delete(listener);
      };
    }
  };
}

export const terminalPaneStatusRegistry = createTerminalPaneStatusRegistry();
