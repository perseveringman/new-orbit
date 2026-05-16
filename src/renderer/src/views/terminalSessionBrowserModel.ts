import type { TerminalAgentSessionDTO } from '@shared/ipc';

export interface TerminalSessionAgentFilter {
  id: string;
  title: string;
  count: number;
}

export interface TerminalSessionAgentMeta {
  id: string;
  title: string;
  badgeClassName: string;
  dotClassName: string;
}

const KNOWN_AGENT_ORDER = ['claude', 'codex', 'copilot', 'amp', 'codebuddy', 'unknown'];

export function getTerminalSessionAgentMeta(agentType: string): TerminalSessionAgentMeta {
  switch (agentType) {
    case 'claude':
      return {
        id: 'claude',
        title: 'Claude Code',
        badgeClassName:
          'bg-violet-500/15 text-violet-700 dark:text-violet-300',
        dotClassName: 'bg-violet-500'
      };
    case 'codex':
      return {
        id: 'codex',
        title: 'Codex',
        badgeClassName:
          'bg-sky-500/15 text-sky-700 dark:text-sky-300',
        dotClassName: 'bg-sky-500'
      };
    case 'copilot':
      return {
        id: 'copilot',
        title: 'Copilot CLI',
        badgeClassName:
          'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
        dotClassName: 'bg-emerald-500'
      };
    case 'amp':
      return {
        id: 'amp',
        title: 'Amp',
        badgeClassName:
          'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
        dotClassName: 'bg-fuchsia-500'
      };
    case 'codebuddy':
      return {
        id: 'codebuddy',
        title: 'CodeBuddy',
        badgeClassName:
          'bg-amber-500/15 text-amber-700 dark:text-amber-300',
        dotClassName: 'bg-amber-500'
      };
    case 'unknown':
      return {
        id: 'unknown',
        title: '未知',
        badgeClassName:
          'bg-neutral-500/15 text-neutral-700 dark:text-neutral-300',
        dotClassName: 'bg-neutral-400'
      };
    default: {
      const title = agentType.trim() || '未知';
      return {
        id: title.toLowerCase(),
        title: title.charAt(0).toUpperCase() + title.slice(1),
        badgeClassName:
          'bg-neutral-500/15 text-neutral-700 dark:text-neutral-300',
        dotClassName: 'bg-neutral-400'
      };
    }
  }
}

export function getTerminalSessionDisplayTitle(session: TerminalAgentSessionDTO): string {
  return session.title?.trim() || session.summary?.trim() || `${getTerminalSessionAgentMeta(session.agentType).title} 会话`;
}

export function getTerminalSessionSubtitle(session: TerminalAgentSessionDTO): string {
  if (session.summary?.trim() && session.summary.trim() !== getTerminalSessionDisplayTitle(session)) {
    return session.summary.trim();
  }
  return `${getTerminalSessionAgentMeta(session.agentType).title} · ${terminalSessionStatusLabel(session.status)}`;
}

function sortSessions(sessions: TerminalAgentSessionDTO[]): TerminalAgentSessionDTO[] {
  return [...sessions].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

export function getTerminalSessionAgentFilters(
  sessions: TerminalAgentSessionDTO[]
): TerminalSessionAgentFilter[] {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    counts.set(session.agentType, (counts.get(session.agentType) ?? 0) + 1);
  }

  const orderedIds = [...KNOWN_AGENT_ORDER.filter((id) => counts.has(id))];
  for (const id of counts.keys()) {
    if (!orderedIds.includes(id)) orderedIds.push(id);
  }

  return [
    { id: 'all', title: '全部', count: sessions.length },
    ...orderedIds.map((id) => ({
      id,
      title: getTerminalSessionAgentMeta(id).title,
      count: counts.get(id) ?? 0
    }))
  ];
}

function terminalSessionStatusLabel(status: TerminalAgentSessionDTO['status']): string {
  if (status === 'active') return '活跃';
  if (status === 'completed') return '已完成';
  return '失败';
}

export function filterTerminalSessions(
  sessions: TerminalAgentSessionDTO[],
  args: {
    activeAgent: string;
    searchQuery: string;
  }
): TerminalAgentSessionDTO[] {
  const query = args.searchQuery.trim().toLowerCase();

  return sortSessions(sessions).filter((session) => {
    if (args.activeAgent !== 'all' && session.agentType !== args.activeAgent) return false;
    if (!query) return true;

    const haystack = [
      getTerminalSessionDisplayTitle(session),
      session.summary ?? '',
      session.sessionId,
      session.vendorSessionId ?? ''
    ]
      .join('\n')
      .toLowerCase();

    return haystack.includes(query);
  });
}

export function resolveTerminalSessionSelection(
  sessions: TerminalAgentSessionDTO[],
  selectedSessionId: string | null | undefined
): string | null {
  const sorted = sortSessions(sessions);
  if (selectedSessionId && sorted.some((session) => session.sessionId === selectedSessionId)) {
    return selectedSessionId;
  }
  return sorted[0]?.sessionId ?? null;
}
