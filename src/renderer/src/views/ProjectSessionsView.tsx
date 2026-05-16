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

  const refresh = useCallback(async () => {
    try {
      const next = await window.orbit.terminalAgent.list(projectUid);
      setSessions(next);
      const nextSelected = resolveTerminalSessionSelection(next, selectedSessionId);
      setSidebarFocus({
        projectUid,
        sessionId: nextSelected
      });
    } catch (e) {
      toast(`加载项目会话失败：${(e as Error).message}`);
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
          toast(`加载会话详情失败：${(e as Error).message}`);
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
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        {sessions.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-sm text-neutral-500">
            还没有项目会话。在项目终端中启动 Claude 或 Codex 后，Orbit 会在这里构建可复用的历史。
          </div>
        ) : selected ? (
          <ProjectSessionsDetailPane
            selected={selected}
            detail={detail}
            onOpenSession={() => onOpenSession(getTerminalSessionAction(selected).navigation)}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-sm text-neutral-500">
            请从右侧边栏选择一个会话，以查看历史并回到工作现场。
          </div>
        )}
      </div>
    </section>
  );
}

export function ProjectSessionsDetailPane({
  selected,
  detail,
  onOpenSession
}: {
  selected: TerminalAgentSessionDTO;
  detail: TerminalAgentSessionDetailDTO | null;
  onOpenSession(): void;
}): JSX.Element {
  const agentMeta = getTerminalSessionAgentMeta(selected.agentType);
  const action = getTerminalSessionAction(selected);
  const presentedMessages = useMemo(
    () => buildFriendlyTranscriptMessages(detail?.messages ?? []),
    [detail?.messages]
  );
  const summary = getProjectSessionSummary(selected);

  return (
    <div className="flex min-h-0 h-full flex-1 flex-col">
      <div className="min-w-0 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
              <span className={`rounded px-2 py-1 font-medium ${agentMeta.badgeClassName}`}>
                {agentMeta.title}
              </span>
              <span className={statusClasses(selected.status)}>{sessionStatusLabel(selected.status)}</span>
            </div>
            <div className="mt-3 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              {getTerminalSessionDisplayTitle(selected)}
            </div>
            {summary ? (
              <div className="mt-2 max-w-3xl text-sm text-neutral-600 dark:text-neutral-300">
                {summary}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
              <span>开始于 {formatRelativeTs(selected.startedAt)}</span>
              <span>最近活跃 {formatRelativeTs(selected.lastActivityAt)}</span>
              {presentedMessages.length ? <span>{presentedMessages.length} 轮对话</span> : null}
            </div>
          </div>
          <button
            onClick={onOpenSession}
            className="shrink-0 rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
          >
            {terminalSessionActionLabel(action.hint)}
          </button>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-4">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
          对话
        </div>
        {presentedMessages.length ? (
          <div className="min-w-0 space-y-3">
            {presentedMessages.map((message) => (
              <div
                key={message.id}
                className="min-w-0 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="mb-1 flex items-center justify-between gap-3 text-[10px] uppercase tracking-wide text-neutral-500">
                  <span>{messageRoleLabel(message.role)}</span>
                  <span className="shrink-0">{formatRelativeTs(message.at)}</span>
                </div>
                <div className="min-w-0 overflow-hidden break-all whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-100">
                  {message.text}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-xs text-neutral-500 dark:border-neutral-700">
            这个会话还没有导入对话内容。
          </div>
        )}
      </div>
    </div>
  );
}

function getProjectSessionSummary(session: TerminalAgentSessionDTO): string | null {
  const title = getTerminalSessionDisplayTitle(session);
  const subtitle = getTerminalSessionSubtitle(session).trim();
  if (!subtitle || subtitle === title) return null;

  const fallbackSubtitle = `${getTerminalSessionAgentMeta(session.agentType).title} · ${session.status}`;
  return subtitle === fallbackSubtitle ? null : subtitle;
}

function buildFriendlyTranscriptMessages(
  messages: TerminalAgentSessionDetailDTO['messages']
): TerminalAgentSessionDetailDTO['messages'] {
  const turns: TerminalAgentSessionDetailDTO['messages'] = [];

  for (const message of messages) {
    const text = cleanTranscriptMessage(message);
    if (!text) continue;

    const previous = turns.at(-1);
    if (previous?.role === message.role) {
      previous.text = `${previous.text}\n\n${text}`;
      previous.at = message.at;
      continue;
    }

    turns.push({
      ...message,
      text
    });
  }

  return turns;
}

function cleanTranscriptMessage(
  message: TerminalAgentSessionDetailDTO['messages'][number]
): string {
  if (message.role !== 'assistant') return message.text.trim();

  const sections = message.text
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);

  const cleaned = sections
    .map((section) => {
      if (section.startsWith('Thinking:')) return '';
      if (section.startsWith('Tool Use:')) {
        const name = section
          .slice('Tool Use:'.length)
          .split('\n', 1)[0]
          ?.trim();
        return name ? `使用了 ${name}` : '';
      }
      return section;
    })
    .filter(Boolean);

  return cleaned.join('\n\n').trim();
}

function formatRelativeTs(value: string): string {
  const delta = Date.now() - Date.parse(value);
  if (!Number.isFinite(delta)) return value;
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  return `${days} 天前`;
}

function sessionStatusLabel(status: TerminalAgentSessionDTO['status']): string {
  if (status === 'active') return '活跃';
  if (status === 'completed') return '已完成';
  return '失败';
}

function messageRoleLabel(role: TerminalAgentSessionDetailDTO['messages'][number]['role']): string {
  if (role === 'user') return '用户';
  if (role === 'assistant') return '助手';
  return role;
}

function terminalSessionActionLabel(hint: string): string {
  if (hint === 'Jump to active terminal') return '跳转到活跃终端';
  if (hint === 'Resume in new tab') return '在新标签页继续';
  if (hint === 'Open a fresh terminal with session context') return '带会话上下文打开新终端';
  return hint;
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
