import { useCallback, useEffect, useState } from 'react';
import type { TerminalAgentSessionDTO } from '@shared/ipc';
import { useWorkspace } from '../../store/workspace';
import { useFiles } from '../../store/files';
import { usePara } from '../../store/para';
import { useSidebar } from '../../store/sidebar';
import { queueTerminalNavigation } from '../Terminal/terminalNavigationIntent';
import { getTerminalSessionAction } from './terminalSessionAction';
import {
  filterTerminalSessions,
  getTerminalSessionAgentFilters,
  getTerminalSessionAgentMeta,
  getTerminalSessionDisplayTitle,
  getTerminalSessionSubtitle,
  resolveTerminalSessionSelection
} from '../../views/terminalSessionBrowserModel';

export function TerminalSessionsPanel(): JSX.Element {
  const activeProjectUid = useWorkspace((s) => s.activeProjectUid);
  const setActiveProjectUid = useWorkspace((s) => s.setActiveProjectUid);
  const setView = usePara((s) => s.setView);
  const toast = useFiles((s) => s.toast);
  const sidebarSurface = useSidebar((s) => s.surface);
  const selectedSessionId = useSidebar((s) => s.focus.sessionId);
  const setSidebarFocus = useSidebar((s) => s.setFocus);
  const [sessions, setSessions] = useState<TerminalAgentSessionDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeAgent, setActiveAgent] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const refresh = useCallback(async () => {
    if (!activeProjectUid) {
      setSessions([]);
      setSidebarFocus({ sessionId: null });
      return;
    }
    setLoading(true);
    try {
      const next = await window.orbit.terminalAgent.list(activeProjectUid);
      setSessions(next);
      const nextSelected = resolveTerminalSessionSelection(next, selectedSessionId);
      setSidebarFocus({
        projectUid: activeProjectUid,
        sessionId: nextSelected
      });
    } catch (e) {
      toast(`Load terminal sessions failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [activeProjectUid, selectedSessionId, setSidebarFocus, toast]);

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

  function onOpen(session: TerminalAgentSessionDTO): void {
    const action = getTerminalSessionAction(session);
    if (action.disabled) return;
    queueTerminalNavigation(action.navigation);
    setActiveProjectUid(action.navigation.projectUid);
    setView({ kind: 'project', projectUid: action.navigation.projectUid });
  }

  const sessionFilters = getTerminalSessionAgentFilters(sessions);
  const visibleSessions = filterTerminalSessions(sessions, { activeAgent, searchQuery });
  const selectionMode = sidebarSurface === 'project.sessions';

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
      <div className="border-b border-neutral-200 py-3 dark:border-neutral-800">
        <div className="flex gap-1 overflow-x-auto pb-2">
          {sessionFilters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveAgent(filter.id)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                activeAgent === filter.id
                  ? 'bg-sky-600 text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
              }`}
            >
              {filter.title} <span className="opacity-70">{filter.count}</span>
            </button>
          ))}
        </div>
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search sessions…"
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-900"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto pt-3">
        {visibleSessions.length === 0 ? (
          <div className="flex h-full items-center justify-center px-2 text-center text-xs text-neutral-500">
            {sessions.length === 0
              ? 'No terminal agent sessions yet. Start `claude` or `codex` in a pane and Orbit will record it here.'
              : 'No sessions match the current agent filter.'}
          </div>
        ) : (
          <div className="space-y-2">
            {visibleSessions.map((session) => {
              const action = getTerminalSessionAction(session);
              const agent = getTerminalSessionAgentMeta(session.agentType);
              const active = session.sessionId === selectedSessionId;
              return (
                <button
                  key={session.sessionId}
                  onClick={() => {
                    setSidebarFocus({
                      projectUid: session.projectUid,
                      sessionId: session.sessionId
                    });
                    if (!selectionMode) onOpen(session);
                  }}
                  disabled={action.disabled}
                  className={`block w-full rounded-xl border p-3 text-left transition disabled:cursor-default ${
                    active
                      ? 'border-sky-400 bg-sky-50 dark:border-sky-600 dark:bg-sky-950/30'
                      : 'border-neutral-200 bg-white hover:border-sky-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-sky-700 dark:hover:bg-sky-950/20'
                  } disabled:hover:border-neutral-200 disabled:hover:bg-white dark:disabled:hover:border-neutral-800 dark:disabled:hover:bg-neutral-900`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${agent.dotClassName}`} />
                        <div className="truncate text-xs font-semibold text-neutral-800 dark:text-neutral-100">
                          {getTerminalSessionDisplayTitle(session)}
                        </div>
                      </div>
                      <div className="mt-1 truncate text-[10px] text-neutral-500">
                        {getTerminalSessionSubtitle(session)}
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
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-neutral-500">
                    <span className={`rounded px-1.5 py-0.5 ${agent.badgeClassName}`}>
                      {agent.title}
                    </span>
                    <span>{formatRelativeTs(session.lastActivityAt)}</span>
                    <span>Prompts {session.stats.promptCount}</span>
                    <span>Permissions {session.stats.permissionCount}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-neutral-500">
                    <span className="truncate font-mono">{session.sessionId}</span>
                    <span className="shrink-0 text-sky-600 dark:text-sky-400">
                      {selectionMode ? 'Show details' : action.hint}
                    </span>
                  </div>
                </button>
              );
            })}
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
