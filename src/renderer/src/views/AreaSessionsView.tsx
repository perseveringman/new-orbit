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
  getTerminalSessionDisplayTitle,
  resolveTerminalSessionSelection
} from './terminalSessionBrowserModel';
import { ProjectSessionsDetailPane } from './ProjectSessionsView';

interface Props {
  areaUid: string;
  onOpenSession(intent: TerminalNavigationIntent): void;
}

export function AreaSessionsView({ areaUid, onOpenSession }: Props): JSX.Element {
  const toast = useFiles((s) => s.toast);
  const selectedSessionId = useSidebar((s) => s.focus.sessionId);
  const setSidebarFocus = useSidebar((s) => s.setFocus);
  const [sessions, setSessions] = useState<TerminalAgentSessionDTO[]>([]);
  const [detail, setDetail] = useState<TerminalAgentSessionDetailDTO | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await window.orbit.terminalAgent.list(areaUid);
      setSessions(next);
      const nextSelected = resolveTerminalSessionSelection(next, selectedSessionId);
      setSidebarFocus({
        projectUid: areaUid,
        sessionId: nextSelected
      });
    } catch (error) {
      toast(`Load area sessions failed: ${(error as Error).message}`);
    }
  }, [areaUid, selectedSessionId, setSidebarFocus, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const off = window.orbit.terminalAgent.onEvent((event) => {
      if (event.projectUid && event.projectUid !== areaUid) return;
      void refresh();
    });
    return off;
  }, [areaUid, refresh]);

  useEffect(() => {
    if (!selectedSessionId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void window.orbit.terminalAgent
      .detail(areaUid, selectedSessionId)
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch((error) => {
        if (!cancelled) {
          setDetail(null);
          toast(`Load area session detail failed: ${(error as Error).message}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [areaUid, selectedSessionId, toast]);

  const selected = useMemo(
    () => sessions.find((session) => session.sessionId === selectedSessionId) ?? null,
    [selectedSessionId, sessions]
  );

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        {sessions.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-sm text-neutral-500">
            No area sessions yet. Start Claude or Codex in the area terminal and Orbit will build a
            reusable history here.
          </div>
        ) : selected ? (
          <ProjectSessionsDetailPane
            selected={selected}
            detail={detail}
            onOpenSession={() => onOpenSession(getTerminalSessionAction(selected).navigation)}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-sm text-neutral-500">
            Pick a session from the right sidebar to inspect the transcript for{' '}
            {getTerminalSessionDisplayTitle(sessions[0]!)}.
          </div>
        )}
      </div>
    </section>
  );
}
