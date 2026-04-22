import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import {
  getSession,
  getOrCreateSession,
  setSession as regSetSession,
  clearSession
} from './sessionRegistry';
import { syncTerminalSize } from './terminalSizing';

export interface TerminalPaneHandle {
  refit(): void;
  focus(): void;
}

export interface TerminalPaneProps {
  cwd: string;
  sessionKey: string;
  dark?: boolean;
  /**
   * Extra environment variables injected into the pty session. R5 uses
   * this to seed `ORBIT_VAULT_PATH` / `ORBIT_PROJECT_UID` /
   * `ORBIT_PROJECT_SLUG` so any `claude` sub-process launched from the
   * terminal inherits the same project identity as the embedded MCP
   * server wired up in `.mcp.json`.
   */
  env?: Record<string, string>;
  onExit?: (info: { exitCode: number; signal?: number }) => void;
  onFocus?: () => void;
}

export const TerminalPane = forwardRef<TerminalPaneHandle, TerminalPaneProps>(
  function TerminalPane({ cwd, sessionKey, dark, env, onExit, onFocus }, ref) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const sessionRef = useRef<import('@shared/ipc').TerminalSessionInfoDTO | null>(null);
    const lastGridRef = useRef<{ cols: number; rows: number } | null>(null);
    const [session, setSession] = useState<import('@shared/ipc').TerminalSessionInfoDTO | null>(
      getSession(sessionKey)
    );
    const [exitState, setExitState] = useState<{ exitCode: number; signal?: number } | null>(
      null
    );

    function syncNow(): void {
      const host = hostRef.current;
      const term = termRef.current;
      const fit = fitRef.current;
      if (!host || !term || !fit) return;
      void syncTerminalSize({
        host,
        fit,
        term,
        sessionId: sessionRef.current?.id,
        previousGrid: lastGridRef.current,
        resize: (id, cols, rows) => window.orbit.terminal.resize(id, cols, rows)
      });
      lastGridRef.current = { cols: term.cols, rows: term.rows };
    }

    useImperativeHandle(ref, () => ({
      refit() {
        syncNow();
      },
      focus() {
        termRef.current?.focus();
      }
    }));

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: 12,
      cursorBlink: true,
      allowProposedApi: true,
      theme: dark
        ? {
            background: '#0b0b0d',
            foreground: '#e5e5e5',
            cursor: '#e5e5e5',
            selectionBackground: '#3b3b3f'
          }
        : {
            background: '#ffffff',
            foreground: '#1f1f24',
            cursor: '#1f1f24',
            selectionBackground: '#c7e0ff'
          }
    });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());
      term.open(host);
      termRef.current = term;
      fitRef.current = fit;
      syncNow();

    const welcome = (info: import('@shared/ipc').TerminalSessionInfoDTO): void => {
      term.writeln(`\x1b[2m# Orbit Terminal · ${info.shell} · cwd=${info.cwd}\x1b[0m`);
      term.writeln(`\x1b[2m# Type \`claude\` to start an interactive session.\x1b[0m`);
    };

    const start = async (): Promise<void> => {
      try {
        let info = getSession(sessionKey) ?? null;
        if (!info) {
          const cols = term.cols || 80;
          const rows = term.rows || 24;
          info = await getOrCreateSession(sessionKey, () =>
            window.orbit.terminal.open({ cwd, cols, rows, ...(env ? { env } : {}) })
          );
          // Give the welcome message after ~1s so users notice.
          setTimeout(() => {
            if (!cancelled && termRef.current === term) welcome(info!);
          }, 1000);
        } else {
          term.writeln(
            `\x1b[2m# Re-attached to existing session · ${info.id.slice(0, 6)} (pid ${info.pid})\x1b[0m`
          );
        }
        if (cancelled) return;
        sessionRef.current = info;
        setSession(info);
        lastGridRef.current = null;
        requestAnimationFrame(() => {
          if (!cancelled) syncNow();
        });
      } catch (e) {
        term.writeln(`\x1b[31mFailed to open terminal: ${(e as Error).message}\x1b[0m`);
      }
    };
    void start();

    const dataDisp = term.onData((data) => {
      const s = sessionRef.current;
      if (s) void window.orbit.terminal.write(s.id, data);
    });

    const offData = window.orbit.terminal.onData((ev) => {
      const s = sessionRef.current;
      if (s && ev.id === s.id) term.write(ev.data);
    });
    const offExit = window.orbit.terminal.onExit((ev) => {
      const s = sessionRef.current;
      if (s && ev.id === s.id) {
        setExitState({ exitCode: ev.exitCode, signal: ev.signal });
        setSession(null);
        clearSession(sessionKey);
        sessionRef.current = null;
        lastGridRef.current = null;
        onExit?.({ exitCode: ev.exitCode, signal: ev.signal });
      }
    });

      let resizeFrame: number | null = null;
      const scheduleSync = (): void => {
        if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = null;
          syncNow();
        });
      };
      const ro = new ResizeObserver(() => {
        scheduleSync();
      });
      ro.observe(host);

      return () => {
        cancelled = true;
        ro.disconnect();
        if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
        offData();
        offExit();
        dataDisp.dispose();
        try {
          term.dispose();
        } catch {
          /* ignore */
        }
        termRef.current = null;
        fitRef.current = null;
        // Pty session intentionally preserved.
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionKey, cwd]);

  async function handleKill(): Promise<void> {
    const s = sessionRef.current;
    if (!s) return;
    await window.orbit.terminal.kill(s.id);
    clearSession(sessionKey);
    sessionRef.current = null;
        setSession(null);
        lastGridRef.current = null;
      }

    async function handleRestart(): Promise<void> {
    const term = termRef.current;
    if (!term) return;
    await handleKill();
    setExitState(null);
      try {
        const info = await window.orbit.terminal.open({
          cwd,
        cols: term.cols || 80,
        rows: term.rows || 24,
        ...(env ? { env } : {})
      });
        regSetSession(sessionKey, info);
      sessionRef.current = info;
      setSession(info);
      lastGridRef.current = null;
      term.writeln(`\x1b[2m# Restarted · pid=${info.pid}\x1b[0m`);
    } catch (e) {
      term.writeln(`\x1b[31mRestart failed: ${(e as Error).message}\x1b[0m`);
    }
  }

  async function handleCopyAll(): Promise<void> {
    const term = termRef.current;
    if (!term) return;
    term.selectAll();
    const sel = term.getSelection();
    term.clearSelection();
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
          {session ? (
            <span className="text-neutral-600 dark:text-neutral-300">
              · {session.id.slice(0, 6)} · pid {session.pid}
            </span>
          ) : exitState ? (
            <span className="text-amber-500">
              · exited {exitState.exitCode}
              {exitState.signal ? ` (sig ${exitState.signal})` : ''}
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
        {session ? (
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
});
