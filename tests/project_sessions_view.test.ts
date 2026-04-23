import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type {
  TerminalAgentSessionDTO,
  TerminalAgentSessionDetailDTO
} from '../src/shared/ipc';
import { ProjectSessionsDetailPane } from '../src/renderer/src/views/ProjectSessionsView';

function makeSession(overrides: Partial<TerminalAgentSessionDTO> = {}): TerminalAgentSessionDTO {
  return {
    sessionId: 'tas_session_1',
    paneId: 'pane-1',
    projectUid: 'project-1',
    agentType: 'claude',
    status: 'interrupted',
    startedAt: '2026-04-23T05:45:01.962Z',
    lastActivityAt: '2026-04-23T05:46:03.000Z',
    stats: {
      promptCount: 2,
      permissionCount: 1
    },
    title: 'Claude Code session',
    summary: 'Imported transcript should stay inside the detail pane.',
    ...overrides
  };
}

function makeDetail(overrides: Partial<TerminalAgentSessionDetailDTO> = {}): TerminalAgentSessionDetailDTO {
  return {
    ...makeSession(),
    messages: [
      {
        id: 'msg-1',
        role: 'assistant',
        at: '2026-04-23T05:45:09.346Z',
        text: `Thinking:\n${'x'.repeat(240)}`
      }
    ],
    ...overrides
  };
}

describe('ProjectSessionsDetailPane', () => {
  it('renders long transcript content in a shrinkable wrapped pane', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectSessionsDetailPane, {
        selected: makeSession(),
        detail: makeDetail(),
        onOpenSession: vi.fn()
      })
    );

    expect(html).toContain('Imported transcript');
    expect(html).toContain('min-w-0');
    expect(html).toContain('whitespace-pre-wrap');
    expect(html).toContain('overflow-hidden');
    expect(html).toContain('overflow-x-hidden');
  });

  it('renders selected session content inside a height-constrained flex column', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectSessionsDetailPane, {
        selected: makeSession(),
        detail: makeDetail(),
        onOpenSession: vi.fn()
      })
    );

    expect(html).toContain('flex min-h-0 h-full flex-1 flex-col');
    expect(html).toContain('overflow-y-auto');
  });
});
