import type { TerminalAgentSessionDTO } from '@shared/ipc';

export interface TerminalSessionAction {
  disabled: boolean;
  hint: string;
  navigation: {
    projectUid: string;
    orbitSessionId?: string;
    paneId?: string;
    initialCommand?: string;
    openMode?: 'focus-pane' | 'resume-session' | 'reopen-session';
  };
}

export function getTerminalSessionAction(
  session: TerminalAgentSessionDTO
): TerminalSessionAction {
  if (session.status === 'active') {
    return {
      disabled: false,
      hint: 'Jump to active terminal',
      navigation: {
        projectUid: session.projectUid,
        orbitSessionId: session.sessionId,
        paneId: session.paneId,
        openMode: 'focus-pane'
      }
    };
  }

  if (session.resumeCommand) {
    return {
      disabled: false,
      hint: 'Resume in new tab',
      navigation: {
        projectUid: session.projectUid,
        orbitSessionId: session.sessionId,
        initialCommand: session.resumeCommand,
        openMode: 'resume-session'
      }
    };
  }

  return {
    disabled: false,
    hint: 'Open a fresh terminal with session context',
    navigation: {
      projectUid: session.projectUid,
      orbitSessionId: session.sessionId,
      openMode: 'reopen-session'
    }
  };
}
