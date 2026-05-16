import type { TerminalAgentSessionDTO } from '@shared/ipc';

export interface TerminalSessionAction {
  disabled: boolean;
  hint: string;
  navigation: {
    projectUid: string;
    roomKind: 'project' | 'area';
    orbitSessionId?: string;
    paneId?: string;
    initialCommand?: string;
    openMode?: 'focus-pane' | 'resume-session' | 'reopen-session';
  };
}

export function getTerminalSessionAction(
  session: TerminalAgentSessionDTO
): TerminalSessionAction {
  const roomKind = session.roomKind ?? 'project';
  if (session.status === 'active') {
    return {
      disabled: false,
      hint: '跳转到活跃终端',
      navigation: {
        projectUid: session.projectUid,
        roomKind,
        orbitSessionId: session.sessionId,
        paneId: session.paneId,
        openMode: 'focus-pane'
      }
    };
  }

  if (session.resumeCommand) {
    return {
      disabled: false,
      hint: '在新标签页继续',
      navigation: {
        projectUid: session.projectUid,
        roomKind,
        orbitSessionId: session.sessionId,
        initialCommand: session.resumeCommand,
        openMode: 'resume-session'
      }
    };
  }

  return {
    disabled: false,
      hint: '带会话上下文打开新终端',
      navigation: {
        projectUid: session.projectUid,
        roomKind,
        orbitSessionId: session.sessionId,
        openMode: 'reopen-session'
      }
  };
}
