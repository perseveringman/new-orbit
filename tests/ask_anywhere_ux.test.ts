import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Conversation } from '../src/shared/conversation';
import type { ContextPacket } from '../src/shared/context';
import type { ConversationStage } from '../src/shared/stage';
import { ContextBar } from '../src/renderer/src/views/ask-anywhere/ContextBar';
import { StageDrawer } from '../src/renderer/src/views/ask-anywhere/StageDrawer';
import { FloatingBall } from '../src/renderer/src/components/ask-anywhere/FloatingBall';
import { ConversationShell } from '../src/renderer/src/components/conversation';
import { deriveSidebarAskContext } from '../src/renderer/src/components/Sidebar/SidebarAskPanel';

const conversation: Conversation = {
  id: 'ask-1',
  createdAt: '2026-04-28T00:00:00Z',
  updatedAt: '2026-04-28T01:00:00Z',
  status: 'active',
  title: '随处问',
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

describe('随处问 UX revamp components', () => {
  it('renders 上下文Bar as a collapsed summary by default', () => {
    const html = renderToStaticMarkup(createElement(ContextBar, { conversation }));

    expect(html).toContain('上下文');
    expect(html).toContain('2 个锚点');
    expect(html).toContain('4 个技能');
    expect(html).not.toContain('orbit-capture');
  });

  it('renders 舞台Drawer only when it is open and has artifacts', () => {
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
    expect(openHtml).toContain('阶段');
    expect(openHtml).toContain('UX direction summary');
  });

  it('keeps the floating ball as a popover toggle instead of a navigation action', () => {
    const html = renderToStaticMarkup(
      createElement(FloatingBall, {
        open: false,
        onToggle: vi.fn()
      })
    );

    expect(html).toContain('打开随处问');
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

    expect(html).toContain('随处问');
    expect(html).toContain('Hello from Orbit');
    expect(html).toContain('产物阶段');
    expect(html).toContain('UX direction summary');
  });

  it('shows Ask Runtime status without pretending context work is model streaming', () => {
    const html = renderToStaticMarkup(
      createElement(ConversationShell, {
        conversations: [conversation],
        activeId: conversation.id,
        activeConversation: {
          ...conversation,
          currentRunId: 'ask-run-1',
          runtimeHint: 'Ask Runtime'
        },
        events: [
          {
            id: 'ctx-1',
            at: '2026-04-28T01:00:00Z',
            kind: 'runtime.context',
            conversationId: conversation.id,
            runId: 'ask-run-1',
            spanId: 'ctx-1',
            payload: {
              lane: 'retrieval',
              status: 'completed',
              label: '检索上下文已就绪',
              detail: '检索上下文已进入本轮提示词。',
              evidenceCount: 2
            }
          }
        ],
        stage,
        isLoading: true,
        onSelect: vi.fn(),
        onNew: vi.fn(),
        onArchive: vi.fn(),
        onAction: vi.fn(),
        onArtifactAction: vi.fn()
      })
    );

    expect(html).toContain('检索上下文已就绪');
    expect(html).not.toContain('流式输出中');
  });

  it('renders PMIL context chips and context packet artifact details', () => {
    const html = renderToStaticMarkup(
      createElement(ConversationShell, {
        conversations: [conversation],
        activeId: conversation.id,
        activeConversation: conversation,
        events: [],
        stage: {
          ...stage,
          artifacts: [
            ...stage.artifacts,
            {
              id: 'pmil-context-1',
              conversation_id: conversation.id,
              kind: 'pmil.context_packet',
              created_at: '2026-05-16T00:00:00Z',
              title: 'PMIL 上下文 Packet',
              summary: '1 section, 1 evidence selector',
              payload: sampleContextPacket(),
              status: 'confirmed'
            }
          ]
        },
        isLoading: false,
        onSelect: vi.fn(),
        onNew: vi.fn(),
        onArchive: vi.fn(),
        onAction: vi.fn(),
        onArtifactAction: vi.fn()
      })
    );

    expect(html).toContain('PMIL 上下文');
    expect(html).toContain('Personal QA');
    expect(html).toContain('打开来源');
    expect(html).toContain('PMIL should use cited evidence');
  });

  it('derives scoped sidebar Ask context from the active workspace view', () => {
    const projectContext = deriveSidebarAskContext({
      view: { kind: 'project', projectUid: 'project-1' },
      activeFile: null,
      activeProjectUid: 'project-1',
      projects: [{ uid: 'project-1', slug: 'ship-orbit', name: 'Ship Orbit' }],
      areas: []
    });
    expect(projectContext.scope).toEqual({ kind: 'project', project_id: 'project-1' });
    expect(projectContext.title).toBe('提问 · Ship Orbit');

    const resourceContext = deriveSidebarAskContext({
      view: { kind: 'resource', resourceSlug: 'llm-agents' },
      activeFile: null,
      activeProjectUid: null,
      projects: [],
      areas: []
    });
    expect(resourceContext.scope).toEqual({ kind: 'resource', resource_slug: 'llm-agents' });

    const noteContext = deriveSidebarAskContext({
      view: { kind: 'editor' },
      activeFile: { relPath: '02_Areas/vision/README.md' },
      activeProjectUid: null,
      projects: [],
      areas: []
    });
    expect(noteContext.scope).toEqual({ kind: 'note', note_id: '02_Areas/vision/README.md' });

    const feedContext = deriveSidebarAskContext({
      view: { kind: 'feeds' },
      activeFile: null,
      activeProjectUid: null,
      projects: [],
      areas: []
    });
    expect(feedContext.scope).toEqual({
      kind: 'external',
      platform: 'orbit.feed',
      user_id: 'local'
    });
    expect(feedContext.title).toBe('提问 · 信息流');
  });
});

function sampleContextPacket(): ContextPacket {
  return {
    id: 'ctx-1',
    purpose: 'ask',
    scope: { kind: 'global' },
    query: 'PMIL',
    generated_at: '2026-05-16T00:00:00.000Z',
    freshness: { evidence_until: '2026-05-16T00:00:00.000Z', stale_sources: [] },
    budget: { max_tokens: 2200, estimated_tokens: 90 },
    sections: [
      {
        kind: 'synthesis',
        title: 'Personal QA',
        content: 'PMIL should use cited evidence and graph neighbors.',
        citations: [
          {
            source_id: 'evidence:note:pmil',
            kind: 'semantic_chunk',
            content_view: 'safe_projection'
          }
        ],
        priority: 25
      }
    ],
    evidence: [
      {
        source_id: 'evidence:note:pmil',
        kind: 'semantic_chunk',
        content_view: 'safe_projection'
      }
    ],
    synthesis_refs: ['synth-qa-1'],
    memory_refs: []
  };
}
