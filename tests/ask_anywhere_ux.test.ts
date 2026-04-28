import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Conversation } from '../src/shared/conversation';
import type { ConversationStage } from '../src/shared/stage';
import { ContextBar } from '../src/renderer/src/views/ask-anywhere/ContextBar';
import { StageDrawer } from '../src/renderer/src/views/ask-anywhere/StageDrawer';
import { FloatingBall } from '../src/renderer/src/components/ask-anywhere/FloatingBall';
import { ConversationShell } from '../src/renderer/src/components/conversation';

const conversation: Conversation = {
  id: 'ask-1',
  createdAt: '2026-04-28T00:00:00Z',
  updatedAt: '2026-04-28T01:00:00Z',
  status: 'active',
  title: 'Ask Anywhere',
  anchors: [
    { kind: 'ask_anywhere_session', refId: 'ask-1', addedAt: '2026-04-28T00:00:00Z' },
    { kind: 'capture_item', refId: 'cap-1', addedAt: '2026-04-28T00:05:00Z' }
  ],
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

describe('Ask Anywhere UX revamp components', () => {
  it('renders ContextBar as a collapsed summary by default', () => {
    const html = renderToStaticMarkup(createElement(ContextBar, { conversation }));

    expect(html).toContain('Context');
    expect(html).toContain('2 anchors');
    expect(html).toContain('4 skills');
    expect(html).not.toContain('orbit-capture');
  });

  it('renders StageDrawer only when it is open and has artifacts', () => {
    const closedHtml = renderToStaticMarkup(
      createElement(StageDrawer, {
        stage,
        open: false,
        onClose: vi.fn(),
        onAction: vi.fn()
      })
    );
    const openHtml = renderToStaticMarkup(
      createElement(StageDrawer, {
        stage,
        open: true,
        onClose: vi.fn(),
        onAction: vi.fn()
      })
    );

    expect(closedHtml).toBe('');
    expect(openHtml).toContain('Stage');
    expect(openHtml).toContain('UX direction summary');
  });

  it('keeps the floating ball as a popover toggle instead of a navigation action', () => {
    const html = renderToStaticMarkup(
      createElement(FloatingBall, {
        open: false,
        onToggle: vi.fn()
      })
    );

    expect(html).toContain('Open Ask Anywhere');
    expect(html).toContain('aria-pressed="false"');
  });

  it('renders the unified conversation shell with shared conversation and stage state', () => {
    const html = renderToStaticMarkup(
      createElement(ConversationShell, {
        conversations: [conversation],
        activeId: conversation.id,
        activeConversation: conversation,
        events: [
          {
            id: 'evt-1',
            at: '2026-04-28T01:00:00Z',
            kind: 'runtime.message',
            conversationId: conversation.id,
            runId: 'run-1',
            spanId: 'span-1',
            payload: { text: 'Hello from Orbit', role: 'assistant', isFinal: true }
          }
        ],
        stage,
        isLoading: false,
        onSelect: vi.fn(),
        onNew: vi.fn(),
        onArchive: vi.fn(),
        onAction: vi.fn(),
        onArtifactAction: vi.fn()
      })
    );

    expect(html).toContain('Ask Anywhere');
    expect(html).toContain('Hello from Orbit');
    expect(html).toContain('Artifact Stage');
    expect(html).toContain('UX direction summary');
  });
});
