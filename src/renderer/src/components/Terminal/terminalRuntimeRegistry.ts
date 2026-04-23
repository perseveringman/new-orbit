import type {
  TerminalDataEventDTO,
  TerminalExitEventDTO,
  TerminalSessionInfoDTO
} from '@shared/ipc';
import { clearSession, getOrCreateSession } from './sessionRegistry';
import { createBrowserTerminalRuntime } from './terminalRuntime';

export interface TerminalRuntimeHost {
  id: string;
}

export interface TerminalRuntime {
  attach(host: TerminalRuntimeHost): void;
  detach(): void;
  dispose(): void;
  write(data: string): void;
  focus(): void;
  refit(): void;
  clear(): void;
  selectAll(): void;
  getSelection(): string;
  clearSelection(): void;
  setTheme(dark?: boolean): void;
  onInput(cb: (data: string) => void): () => void;
}

export interface TerminalRuntimeSnapshot {
  session: TerminalSessionInfoDTO | null;
  exitState: { exitCode: number; signal?: number } | null;
}

export interface TerminalRuntimeRegistryDeps {
  createRuntime(args: { sessionKey: string; dark?: boolean }): TerminalRuntime;
  ensureSession(args: {
    sessionKey: string;
    cwd: string;
    dark?: boolean;
    env?: Record<string, string>;
    initialCommand?: string;
    agentLaunch?: {
      launcherCommand: string;
      prompt: string;
    };
  }): Promise<TerminalSessionInfoDTO>;
  clearSession(sessionKey: string): void;
  write(sessionId: string, data: string): void | Promise<void>;
  killSession(sessionId: string): Promise<void>;
  onData(cb: (event: TerminalDataEventDTO) => void): () => void;
  onExit(cb: (event: TerminalExitEventDTO) => void): () => void;
}

interface RegistryEntry {
  runtime: TerminalRuntime;
  snapshot: TerminalRuntimeSnapshot;
  offInput: (() => void) | null;
  offData: (() => void) | null;
  offExit: (() => void) | null;
  listeners: Set<() => void>;
}

export function createTerminalRuntimeRegistry(deps: TerminalRuntimeRegistryDeps) {
  const entries = new Map<string, RegistryEntry>();

  function getEntry(sessionKey: string): RegistryEntry | null {
    return entries.get(sessionKey) ?? null;
  }

  function ensureEntry(sessionKey: string, dark?: boolean): RegistryEntry {
    const existing = getEntry(sessionKey);
    if (existing) {
      existing.runtime.setTheme(dark);
      return existing;
    }

    const runtime = deps.createRuntime({ sessionKey, dark });
    const entry: RegistryEntry = {
      runtime,
      snapshot: { session: null, exitState: null },
      offInput: null,
      offData: null,
      offExit: null,
      listeners: new Set()
    };

    const emit = (): void => {
      for (const listener of entry.listeners) listener();
    };

    entry.offInput = runtime.onInput((data) => {
      const sessionId = entry.snapshot.session?.id;
      if (sessionId) void deps.write(sessionId, data);
    });

    entry.offData = deps.onData((event) => {
      if (event.id !== entry.snapshot.session?.id) return;
      runtime.write(event.data);
    });

    entry.offExit = deps.onExit((event) => {
      if (event.id !== entry.snapshot.session?.id) return;
      deps.clearSession(sessionKey);
      entry.snapshot = {
        session: null,
        exitState: { exitCode: event.exitCode, ...(event.signal ? { signal: event.signal } : {}) }
      };
      emit();
    });

    entries.set(sessionKey, entry);
    return entry;
  }

  return {
    async attach(args: {
      sessionKey: string;
      host: TerminalRuntimeHost;
      cwd: string;
      dark?: boolean;
      env?: Record<string, string>;
      initialCommand?: string;
      agentLaunch?: {
        launcherCommand: string;
        prompt: string;
      };
    }): Promise<TerminalRuntimeSnapshot> {
      const entry = ensureEntry(args.sessionKey, args.dark);
      entry.runtime.attach(args.host);
      if (!entry.snapshot.session) {
        entry.snapshot = {
          session: await deps.ensureSession({
            sessionKey: args.sessionKey,
            cwd: args.cwd,
            dark: args.dark,
            ...(args.env ? { env: args.env } : {}),
            ...(args.initialCommand ? { initialCommand: args.initialCommand } : {}),
            ...(args.agentLaunch ? { agentLaunch: args.agentLaunch } : {})
          }),
          exitState: null
        };
        for (const listener of entry.listeners) listener();
      }
      return entry.snapshot;
    },

    detach(sessionKey: string): void {
      const entry = getEntry(sessionKey);
      if (!entry) return;
      entry.runtime.detach();
    },

    async dispose(sessionKey: string): Promise<void> {
      const entry = getEntry(sessionKey);
      if (!entry) return;
      const sessionId = entry.snapshot.session?.id;
      if (sessionId) {
        await deps.killSession(sessionId);
      }
      deps.clearSession(sessionKey);
      entry.offInput?.();
      entry.offData?.();
      entry.offExit?.();
      entry.runtime.dispose();
      entries.delete(sessionKey);
    },

    focus(sessionKey: string): void {
      getEntry(sessionKey)?.runtime.focus();
    },

    refit(sessionKey: string): void {
      getEntry(sessionKey)?.runtime.refit();
    },

    clear(sessionKey: string): void {
      getEntry(sessionKey)?.runtime.clear();
    },

    selectAll(sessionKey: string): void {
      getEntry(sessionKey)?.runtime.selectAll();
    },

    getSelection(sessionKey: string): string {
      return getEntry(sessionKey)?.runtime.getSelection() ?? '';
    },

    clearSelection(sessionKey: string): void {
      getEntry(sessionKey)?.runtime.clearSelection();
    },

    async kill(sessionKey: string): Promise<void> {
      const sessionId = getEntry(sessionKey)?.snapshot.session?.id;
      if (!sessionId) return;
      await deps.killSession(sessionId);
    },

    async start(args: {
      sessionKey: string;
      cwd: string;
      dark?: boolean;
      env?: Record<string, string>;
      initialCommand?: string;
      agentLaunch?: {
        launcherCommand: string;
        prompt: string;
      };
    }): Promise<TerminalRuntimeSnapshot> {
      const entry = ensureEntry(args.sessionKey, args.dark);
      entry.snapshot = {
        session: await deps.ensureSession(args),
        exitState: null
      };
      for (const listener of entry.listeners) listener();
      return entry.snapshot;
    },

    getSnapshot(sessionKey: string): TerminalRuntimeSnapshot {
      return getEntry(sessionKey)?.snapshot ?? { session: null, exitState: null };
    },

    subscribe(sessionKey: string, listener: () => void): () => void {
      const entry = ensureEntry(sessionKey);
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },

    listKeys(): string[] {
      return Array.from(entries.keys());
    }
  };
}

export const terminalRuntimeRegistry =
  typeof window !== 'undefined'
    ? createTerminalRuntimeRegistry({
        createRuntime: ({ sessionKey, dark }) =>
          createBrowserTerminalRuntime({ sessionKey, dark }),
        ensureSession: ({ sessionKey, cwd, env, initialCommand, agentLaunch }) =>
          getOrCreateSession(sessionKey, () =>
            window.orbit.terminal.open({
              cwd,
              ...(env ? { env } : {}),
              ...(initialCommand ? { initialCommand } : {}),
              ...(agentLaunch ? { agentLaunch } : {})
            })
          ),
        clearSession,
        write: (sessionId, data) => window.orbit.terminal.write(sessionId, data),
        killSession: (sessionId) => window.orbit.terminal.kill(sessionId),
        onData: (cb) => window.orbit.terminal.onData(cb),
        onExit: (cb) => window.orbit.terminal.onExit(cb)
      })
    : null;
