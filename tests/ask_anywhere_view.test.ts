import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Conversation } from '../src/shared/conversation';
import type { ConversationStage } from '../src/shared/stage';
import { AskAnywhereView } from '../src/renderer/src/views/AskAnywhereView';
import { shouldShowRightSidebar } from '../src/renderer/src/views/VaultView';

const { mockUseAskAnywhereSession } = vi.hoisted(() => ({
  mockUseAskAnywhereSession: vi.fn()
}));

vi.mock('../src/renderer/src/components/ask-anywhere/AskAnywhereHost', () => ({
  useAskAnywhereSession: (...args: unknown[]) => mockUseAskAnywhereSession(...args)
}));

const conversation: Conversation = {
  id: 'ask-1',
  createdAt: '2026-04-28T00:00:00Z',
  updatedAt: '2026-04-28T01:00:00Z',
  status: 'active',
  title: 'Ask Anywhere',
  anchors: [],
  turns: []
};

const stage: ConversationStage = {
  conversation_id: 'ask-1',
  last_updated: '2026-04-28T01:00:00Z',
  artifacts: [
    {
      id: 'artifact-1',
      conversation_id: 'ask-1',
      kind: 'analysis.result',
      created_at: '2026-04-28T01:00:00Z',
      title: 'UX direction summary',
      summary: 'A concise artifact summary.',
      payload: {},
      status: 'confirmed'
    }
  ]
};

describe('AskAnywhereView', () => {
  it('keeps the artifact stage hidden until the user opens it', () => {
    mockUseAskAnywhereSession.mockReturnValue({
      sessions: [conversation],
      activeId: conversation.id,
      activeConversation: conversation,
      events: [],
      stage,
      isLoading: false,
      selectActiveId: vi.fn(),
      handleNew: vi.fn(),
      handleArchive: vi.fn(),
      handleAction: vi.fn(),
      handleArtifactAction: vi.fn()
    });

    const html = renderToStaticMarkup(createElement(AskAnywhereView));

    expect(html).toContain('产物（1）');
    expect(html).not.toContain('UX direction summary');
    expect(html).not.toContain('工件舞台');
  });

  it('removes the workspace right sidebar on the full-page ask surface', () => {
    expect(shouldShowRightSidebar({ kind: 'askAnywhere' })).toBe(false);
    expect(shouldShowRightSidebar({ kind: 'dashboard' })).toBe(true);
  });
});
