import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import '@xterm/xterm/css/xterm.css';
import type { TerminalPaneAgentStatus } from './terminalAgentStatus';
import { terminalPaneStatusRegistry } from './terminalPaneStatusRegistry';
import { terminalRuntimeRegistry } from './terminalRuntimeRegistry';

export interface TerminalPaneHandle {
  refit(): void;
  focus(): void;
}

export interface TerminalPaneProps {
  cwd: string;
  sessionKey: string;
  paneId?: string;
  projectUid?: string;
  isVisible?: boolean;
  initialCommand?: string;
  dark?: boolean;
  env?: Record<string, string>;
  onExit?: (info: { exitCode: number; signal?: number }) => void;
  onFocus?: () => void;
  onInitialCommandConsumed?: () => void;
  onStatusChange?: (status: TerminalPaneAgentStatus) => void;
}

export function getTerminalLaunchKey(args: {
  cwd: string;
  dark?: boolean;
  env?: Record<string, string>;
  initialCommand?: string;
}): string {
  const envEntries = Object.entries(args.env ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify({
    cwd: args.cwd,
    dark: args.dark ?? false,
    initialCommand: args.initialCommand ?? '',
    env: envEntries
  });
}

export const TerminalPane = forwardRef<TerminalPaneHandle, TerminalPaneProps>(
  function TerminalPane(
    {
      cwd,
      sessionKey,
      initialCommand,
      dark,
      env,
      onExit,
      onFocus,
      onInitialCommandConsumed,
      onStatusChange
    },
    ref
  ) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const launchKey = getTerminalLaunchKey({ cwd, dark, env, initialCommand });
    const launchArgsRef = useRef<{
      key: string;
      value: {
        cwd: string;
        dark?: boolean;
        env?: Record<string, string>;
        initialCommand?: string;
      };
    } | null>(null);
    if (!launchArgsRef.current || launchArgsRef.current.key !== launchKey) {
      launchArgsRef.current = {
        key: launchKey,
        value: {
          cwd,
          dark,
          ...(env ? { env } : {}),
          ...(initialCommand ? { initialCommand } : {})
        }
      };
    }
    const launchArgs = launchArgsRef.current.value;
    const [snapshot, setSnapshot] = useState(() =>
      terminalRuntimeRegistry?.getSnapshot(sessionKey) ?? { session: null, exitState: null }
    );
    const [agentStatus, setAgentStatus] = useState<TerminalPaneAgentStatus>(() =>
      terminalPaneStatusRegistry.get(sessionKey)
    );
    const lastExitRef = useRef<string | null>(null);

    useImperativeHandle(ref, () => ({
      refit() {
        terminalRuntimeRegistry?.refit(sessionKey);
      },
      focus() {
        terminalRuntimeRegistry?.focus(sessionKey);
      }
    }));

    useEffect(() => {
      const registry = terminalRuntimeRegistry;
      if (!registry) return;
      return registry.subscribe(sessionKey, () => {
        setSnapshot(registry.getSnapshot(sessionKey));
      });
    }, [sessionKey]);

    useEffect(() => {
      onStatusChange?.(agentStatus);
    }, [agentStatus, onStatusChange]);

    useEffect(() => {
      setAgentStatus(terminalPaneStatusRegistry.get(sessionKey));
      return terminalPaneStatusRegistry.subscribe(sessionKey, () => {
        setAgentStatus(terminalPaneStatusRegistry.get(sessionKey));
      });
    }, [sessionKey]);

    useEffect(() => {
      const host = hostRef.current;
      const registry = terminalRuntimeRegistry;
      if (!host || !registry) return;
      let cancelled = false;
      void registry
        .attach({
          sessionKey,
          host,
          ...launchArgs
        })
        .then((next) => {
          if (cancelled) return;
          setSnapshot(next);
          if (initialCommand) onInitialCommandConsumed?.();
        });

      return () => {
        cancelled = true;
        registry.detach(sessionKey);
      };
    }, [sessionKey, launchArgs, initialCommand, onInitialCommandConsumed]);

    useEffect(() => {
      const exitState = snapshot.exitState;
      if (!exitState) {
        lastExitRef.current = null;
        return;
      }
      const key = `${exitState.exitCode}:${exitState.signal ?? ''}`;
      if (lastExitRef.current === key) return;
      lastExitRef.current = key;
      terminalPaneStatusRegistry.clear(sessionKey);
      onExit?.(exitState);
    }, [snapshot.exitState, onExit, sessionKey]);

    async function handleKill(): Promise<void> {
      await terminalRuntimeRegistry?.kill(sessionKey);
    }

    async function handleRestart(): Promise<void> {
      if (!terminalRuntimeRegistry) return;
      const next = await terminalRuntimeRegistry.start({
        sessionKey,
        cwd,
        dark,
        ...(env ? { env } : {}),
        ...(initialCommand ? { initialCommand } : {})
      });
      setSnapshot(next);
      terminalPaneStatusRegistry.clear(sessionKey);
    }

    async function handleCopyAll(): Promise<void> {
      if (!terminalRuntimeRegistry) return;
      terminalRuntimeRegistry.selectAll(sessionKey);
      const sel = terminalRuntimeRegistry.getSelection(sessionKey);
      terminalRuntimeRegistry.clearSelection(sessionKey);
      try {
        await navigator.clipboard.writeText(sel);
      } catch {
        /* ignore */
      }
    }

    return (
      <div
        data-orbit-terminal
        className={`flex h-full min-h-0 min-w-0 flex-col ${dark ? 'bg-neutral-950' : 'bg-white'}`}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-2 py-1 text-[11px] text-neutral-500 dark:border-neutral-800">
          <span className="font-mono">
            Terminal{' '}
            {snapshot.session ? (
              <span className="text-neutral-600 dark:text-neutral-300">
                · {snapshot.session.id.slice(0, 6)} · pid {snapshot.session.pid}
              </span>
            ) : snapshot.exitState ? (
              <span className="text-amber-500">
                · exited {snapshot.exitState.exitCode}
                {snapshot.exitState.signal ? ` (sig ${snapshot.exitState.signal})` : ''}
              </span>
            ) : (
              <span>· starting…</span>
            )}
          </span>
          <span className="flex-1" />
          <button
            className="rounded border border-neutral-300 px-1.5 py-0.5 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            onClick={() => void handleCopyAll()}
          >
            Copy
          </button>
          {snapshot.session ? (
            <button
              className="rounded border border-red-300 px-1.5 py-0.5 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
              onClick={() => void handleKill()}
            >
              Kill
            </button>
          ) : (
            <button
              className="rounded border border-sky-300 px-1.5 py-0.5 text-sky-600 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-400 dark:hover:bg-sky-950/40"
              onClick={() => void handleRestart()}
            >
              Restart
            </button>
          )}
        </header>
        <div
          ref={hostRef}
          className="min-h-0 min-w-0 flex-1 overflow-hidden"
          style={{ padding: 4 }}
          onFocus={onFocus}
        />
      </div>
    );
  }
);
