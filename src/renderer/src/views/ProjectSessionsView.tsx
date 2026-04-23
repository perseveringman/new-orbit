import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  TerminalAgentSessionDTO,
  TerminalAgentSessionDetailDTO
} from '@shared/ipc';
import { useFiles } from '../store/files';
import { useSidebar } from '../store/sidebar';
import { getTerminalSessionAction } from '../components/Sidebar/terminalSessionAction';
import type { TerminalNavigationIntent } from '../components/Terminal/terminalNavigationIntent';
import {
  getTerminalSessionAgentMeta,
  getTerminalSessionDisplayTitle,
  getTerminalSessionSubtitle,
  resolveTerminalSessionSelection
} from './terminalSessionBrowserModel';

interface ProjectSessionsViewProps {
  projectUid: string;
  onOpenSession(intent: TerminalNavigationIntent): void;
}

export function ProjectSessionsView({
  projectUid,
  onOpenSession
}: ProjectSessionsViewProps): JSX.Element {
  const toast = useFiles((s) => s.toast);
  const selectedSessionId = useSidebar((s) => s.focus.sessionId);
  const setSidebarFocus = useSidebar((s) => s.setFocus);
  const [sessions, setSessions] = useState<TerminalAgentSessionDTO[]>([]);
  const [detail, setDetail] = useState<TerminalAgentSessionDetailDTO | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await window.orbit.terminalAgent.list(projectUid);
      setSessions(next);
      const nextSelected = resolveTerminalSessionSelection(next, selectedSessionId);
      setSidebarFocus({
        projectUid,
        sessionId: nextSelected
      });
    } catch (e) {
      toast(`Load project sessions failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [projectUid, selectedSessionId, setSidebarFocus, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const off = window.orbit.terminalAgent.onEvent((event) => {
      if (event.projectUid && event.projectUid !== projectUid) return;
      void refresh();
    });
    return off;
  }, [projectUid, refresh]);

  useEffect(() => {
    if (!selectedSessionId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void window.orbit.terminalAgent
      .detail(projectUid, selectedSessionId)
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch((e) => {
        if (!cancelled) {
          setDetail(null);
          toast(`Load session detail failed: ${(e as Error).message}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectUid, selectedSessionId, toast]);

  const selected = useMemo(
    () => sessions.find((session) => session.sessionId === selectedSessionId) ?? null,
    [selectedSessionId, sessions]
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3 text-xs dark:border-neutral-800">
        <div>
          <div className="font-medium text-neutral-700 dark:text-neutral-200">Project Sessions</div>
          <div className="text-neutral-500">
            {loading ? 'Refreshing...' : `${sessions.length} project-linked sessions`}
          </div>
        </div>
        <button
          onClick={() => void refresh()}
          className="rounded border border-neutral-300 px-2 py-1 text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Refresh
        </button>
      </div>

      <div className="border-b border-neutral-200 px-5 py-3 text-xs text-neutral-500 dark:border-neutral-800">
        Session selection lives in the right sidebar. Pick an agent session there to inspect its transcript here.
      </div>

      <div className="min-h-0 flex-1">
        {sessions.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-sm text-neutral-500">
            No project sessions yet. Start Claude or Codex in the project terminal and Orbit will
            build a reusable history here.
          </div>
        ) : selected ? (
          <>
            <div className="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                    <span
                      className={`rounded px-2 py-1 font-medium ${
                        getTerminalSessionAgentMeta(selected.agentType).badgeClassName
                      }`}
                    >
                      {getTerminalSessionAgentMeta(selected.agentType).title}
                    </span>
                    <span className={statusClasses(selected.status)}>{selected.status}</span>
                    <span>Started {formatRelativeTs(selected.startedAt)}</span>
                    <span>Last active {formatRelativeTs(selected.lastActivityAt)}</span>
                  </div>
                  <div className="mt-3 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                    {getTerminalSessionDisplayTitle(selected)}
                  </div>
                  <div className="mt-2 max-w-3xl text-sm text-neutral-500">
                    {getTerminalSessionSubtitle(selected)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-neutral-500">
                    <span className="rounded bg-neutral-100 px-2 py-1 font-mono dark:bg-neutral-800">
                      {selected.sessionId}
                    </span>
                    <span>Pane {selected.paneId}</span>
                    <span>Prompts {selected.stats.promptCount}</span>
                    <span>Permissions {selected.stats.permissionCount}</span>
                    {selected.vendorSessionId ? (
                      <span className="rounded bg-neutral-100 px-2 py-1 font-mono dark:bg-neutral-800">
                        Vendor {selected.vendorSessionId}
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  onClick={() => onOpenSession(getTerminalSessionAction(selected).navigation)}
                  className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
                >
                  {getTerminalSessionAction(selected).hint}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
              <div className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
                Imported transcript
              </div>
              {detail?.messages.length ? (
                <div className="space-y-3">
                  {detail.messages.map((message) => (
                    <div
                      key={message.id}
                      className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
                    >
                      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-neutral-500">
                        <span>{message.role}</span>
                        <span>{formatRelativeTs(message.at)}</span>
                      </div>
                      <div className="whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-100">
                        {message.text}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-xs text-neutral-500 dark:border-neutral-700">
                  No imported transcript is available for this session yet.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-sm text-neutral-500">
            Pick a session from the right sidebar to inspect its history and jump back into work.
          </div>
        )}
      </div>
    </section>
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

function statusClasses(status: TerminalAgentSessionDTO['status']): string {
  if (status === 'active') {
    return 'rounded px-1.5 py-0.5 text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300';
  }
  if (status === 'completed') {
    return 'rounded px-1.5 py-0.5 text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
  }
  return 'rounded px-1.5 py-0.5 text-[10px] bg-red-500/15 text-red-700 dark:text-red-300';
}
