import { useCallback, useEffect, useState } from 'react';
import type { TerminalAgentSessionDTO } from '@shared/ipc';
import { useWorkspace } from '../../store/workspace';
import { useFiles } from '../../store/files';

export function TerminalSessionsPanel(): JSX.Element {
  const activeProjectUid = useWorkspace((s) => s.activeProjectUid);
  const viewProjectUid =
    useWorkspace((s) => s.activeProjectUid);
  const toast = useFiles((s) => s.toast);
  const [sessions, setSessions] = useState<TerminalAgentSessionDTO[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!activeProjectUid) {
      setSessions([]);
      return;
    }
    setLoading(true);
    try {
      const next = await window.orbit.terminalAgent.list(activeProjectUid);
      setSessions(next);
    } catch (e) {
      toast(`Load terminal sessions failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [activeProjectUid, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const off = window.orbit.terminalAgent.onEvent((ev) => {
      if (activeProjectUid && ev.projectUid && ev.projectUid !== activeProjectUid) return;
      void refresh();
    });
    return off;
  }, [activeProjectUid, refresh]);

  function onResume(session: TerminalAgentSessionDTO): void {
    if (!session.resumeCommand || !viewProjectUid) return;
    window.dispatchEvent(
      new CustomEvent('orbit:resume-terminal-session', {
        detail: {
          projectUid: viewProjectUid,
          initialCommand: session.resumeCommand
        }
      })
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-neutral-200 pb-3 text-xs dark:border-neutral-800">
        <div>
          <div className="font-medium text-neutral-700 dark:text-neutral-200">Session History</div>
          <div className="text-neutral-500">
            {loading ? 'Refreshing...' : `${sessions.length} recorded sessions`}
          </div>
        </div>
        <button
          onClick={() => void refresh()}
          className="rounded border border-neutral-300 px-2 py-1 text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Refresh
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto pt-3">
        {sessions.length === 0 ? (
          <div className="flex h-full items-center justify-center px-2 text-center text-xs text-neutral-500">
            No terminal agent sessions yet. Start `claude` or `codex` in a pane and Orbit will record it here.
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <button
                key={session.sessionId}
                onClick={() => onResume(session)}
                disabled={!session.resumeCommand}
                className="block w-full rounded-lg border border-neutral-200 bg-white p-3 text-left hover:border-sky-400 hover:bg-sky-50 disabled:cursor-default disabled:hover:border-neutral-200 disabled:hover:bg-white dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-sky-700 dark:hover:bg-sky-950/20 dark:disabled:hover:border-neutral-800 dark:disabled:hover:bg-neutral-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium capitalize text-neutral-800 dark:text-neutral-100">
                      {session.agentType} · {session.status}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-neutral-500">
                      {session.sessionId}
                    </div>
                  </div>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      session.status === 'active'
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : session.status === 'completed'
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-red-500/15 text-red-700 dark:text-red-300'
                    }`}
                  >
                    {session.status}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-neutral-500">
                  <span>Started {formatRelativeTs(session.startedAt)}</span>
                  <span>Last active {formatRelativeTs(session.lastActivityAt)}</span>
                  <span>Prompts {session.stats.promptCount}</span>
                  <span>Permissions {session.stats.permissionCount}</span>
                </div>
                <div className="mt-2 text-[10px] text-neutral-500">
                  Pane {session.paneId}
                  {session.resumeCommand ? (
                    <span className="ml-2 text-sky-600 dark:text-sky-400">Resume in new tab</span>
                  ) : (
                    <span className="ml-2">Resume unavailable</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatRelativeTs(value: string): string {
  const delta = Date.now() - Date.parse(value);
  if (!Number.isFinite(delta)) return value;
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
