import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  RuntimeEvent,
  RuntimeEventKind,
  RuntimeEventPayloadMap
} from '../src/shared/chat-protocol';
import { DEFAULT_CHAT_HOST_CAPABILITIES } from '../src/shared/chat-protocol';
import {
  CHAT_AUTOSCROLL_THRESHOLD_PX,
  ChatView,
  isChatScrollerNearBottom
} from '../src/renderer/src/components/chat/ChatView';

function ev<K extends RuntimeEventKind>(
  kind: K,
  payload: RuntimeEventPayloadMap[K],
  overrides: Partial<RuntimeEvent> = {}
): RuntimeEvent {
  return {
    id: overrides.id ?? `e-${Math.random().toString(16).slice(2, 8)}`,
    at: '2026-04-29T00:00:00Z',
    kind,
    conversationId: 'c1',
    runId: 'r1',
    spanId: overrides.spanId ?? 's1',
    payload,
    ...overrides
  } as RuntimeEvent;
}

function render(
  events: RuntimeEvent[],
  capabilities = DEFAULT_CHAT_HOST_CAPABILITIES,
  extraProps: Record<string, unknown> = {}
): string {
  return renderToStaticMarkup(
    createElement(ChatView, {
      conversationId: 'c1',
      capabilities,
      events,
      isLoading: false,
      onAction: () => {},
      ...extraProps
    })
  );
}

describe('ChatView', () => {
  it('renders message bubbles in order', () => {
    const html = render([
      ev('runtime.message', { text: 'hello' }, { id: 'm1' }),
      ev('runtime.message', { text: 'world' }, { id: 'm2' })
    ]);
    expect(html).toContain('hello');
    expect(html).toContain('world');
    expect(html.indexOf('hello')).toBeLessThan(html.indexOf('world'));
  });

  it('renders user messages on the right and assistant messages on the left', () => {
    const html = render([
      ev('runtime.message', { text: 'user says hi', role: 'user' }, { id: 'u1' }),
      ev('runtime.message', { text: 'assistant replies', role: 'assistant' }, { id: 'a1' })
    ]);

    expect(html).toContain('justify-end');
    expect(html).toContain('justify-start');
    expect(html).toContain('user says hi');
    expect(html).toContain('assistant replies');
    expect(html).toContain('Agent');
  });

  it('renders assistant markdown instead of raw syntax', () => {
    const html = render([
      ev(
        'runtime.message',
        {
          text: '# Plan\n- **Ship** the fix\n1. Verify the flow\n```ts\nconst ok = true;\n```',
          role: 'assistant'
        },
        { id: 'md1' }
      )
    ]);

    expect(html).toContain('<h1');
    expect(html).toContain('<strong><span>Ship</span></strong>');
    expect(html).toContain('<ol');
    expect(html).toContain('<pre');
    expect(html).not.toContain('```ts');
  });

  it('renders markdown tables as semantic tables', () => {
    const html = render([
      ev(
        'runtime.message',
        {
          text: '现有覆盖：\n\n| 板块 | 深度 |\n|---|---|\n| 古王国→中王国→新王国 | 时间线 + 信仰概念 |\n| 旅行速查 | 实用向 |',
          role: 'assistant'
        },
        { id: 'table1' }
      )
    ]);

    expect(html).toContain('<table');
    expect(html).toContain('<th');
    expect(html).toContain('<td');
    expect(html).toContain('古王国→中王国→新王国');
    expect(html).not.toContain('|---|---|');
  });

  it('lets hosts render semantic citation handles inside assistant markdown', () => {
    const html = render(
      [
        ev(
          'runtime.message',
          {
            text: '这个结论有来源 [[E1]]，也可以用链接形式 [原文](orbit-evidence://E1)。',
            role: 'assistant'
          },
          { id: 'cite1' }
        )
      ],
      DEFAULT_CHAT_HOST_CAPABILITIES,
      {
        renderMarkdownReferenceToken: (token: { handle: string }) =>
          createElement('button', { type: 'button', 'data-handle': token.handle }, token.handle),
        renderMarkdownLink: (token: { href: string; label: string }) =>
          token.href.startsWith('orbit-evidence:')
            ? createElement('button', { type: 'button', 'data-href': token.href }, token.label)
            : null
      }
    );

    expect(html).toContain('data-handle="E1"');
    expect(html).toContain('data-href="orbit-evidence://E1"');
    expect(html).toContain('原文');
  });

  it('merges one streaming assistant response into one bubble', () => {
    const html = render([
      ev(
        'runtime.message',
        { text: '灯光', role: 'assistant', isStreaming: true },
        { id: 's1', runId: 'run-stream', spanId: 's1' }
      ),
      ev(
        'runtime.message',
        { text: '、背景', role: 'assistant', isStreaming: true },
        { id: 's2', runId: 'run-stream', spanId: 's2' }
      ),
      ev(
        'runtime.message',
        { text: '墙', role: 'assistant', isStreaming: true },
        { id: 's3', runId: 'run-stream', spanId: 's3' }
      ),
      ev('runtime.done', { exitCode: 0 }, { id: 'done', runId: 'run-stream', spanId: 'done' })
    ]);

    expect(html).toContain('灯光、背景墙');
    expect(html.match(/>Agent</g)?.length).toBe(1);
    expect(html).not.toContain('▍');
  });

  it('pairs tool_use with matching tool_result', () => {
    const html = render([
      ev(
        'runtime.tool_use',
        { toolName: 'Read', toolInput: { path: 'a.md' }, spanId: 'span-A' },
        { id: 'tu1', spanId: 'span-A' }
      ),
      ev(
        'runtime.tool_result',
        { toolName: 'Read', result: 'file body', parentSpanId: 'span-A' },
        { id: 'tr1' }
      )
    ]);
    expect(html).toContain('读取 a.md');
    expect(html).toContain('已完成');
    expect(html.match(/>结果</g)?.length).toBe(1);
  });

  it('merges one thinking span into one block', () => {
    const html = render([
      ev('runtime.thinking', { text: '查看' }, { id: 't1', runId: 'run-think', spanId: 'think-1' }),
      ev(
        'runtime.thinking',
        { text: '有哪些' },
        { id: 't2', runId: 'run-think', spanId: 'think-1' }
      ),
      ev('runtime.thinking', { text: '项目' }, { id: 't3', runId: 'run-think', spanId: 'think-1' })
    ]);

    expect(html).toContain('查看有哪些项目');
    expect(html.match(/>思考中</g)?.length).toBe(1);
  });

  it('renders semantic thinking and tool summaries', () => {
    const html = render([
      ev(
        'runtime.thinking',
        { text: '查看有哪些项目需要更新，并准备下一步。' },
        { id: 'think-summary', spanId: 'think-summary' }
      ),
      ev(
        'runtime.tool_use',
        { toolName: 'orbit_search', toolInput: { query: 'roadmap' }, spanId: 'tool-summary' },
        { id: 'tool-summary', spanId: 'tool-summary' }
      )
    ]);

    expect(html).toContain('查看有哪些项目需要更新，并准备下一步');
    expect(html).toContain('搜索 &quot;roadmap&quot;');
    expect(html).toContain('输入');
  });

  it('lets hosts constrain message bubbles and runtime event cards', () => {
    const html = render(
      [
        ev('runtime.message', { text: '用户问题', role: 'user' }, { id: 'narrow-user' }),
        ev('runtime.thinking', { text: '正在整理上下文' }, { id: 'narrow-thinking' })
      ],
      DEFAULT_CHAT_HOST_CAPABILITIES,
      {
        messageMaxWidthClass: 'max-w-[70%]',
        eventMaxWidthClass: 'max-w-[70%]'
      }
    );

    expect(html.match(/max-w-\[70%\]/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('renders Ask Runtime phase, route, context, and escalation events semantically', () => {
    const html = render([
      ev(
        'runtime.phase',
        {
          phase: 'accepted',
          status: 'completed',
          label: '已接收',
          detail: '本轮请求已进入 Ask Runtime。'
        },
        { id: 'phase-accepted' }
      ),
      ev(
        'runtime.route',
        {
          route: 'vault_qa',
          confidence: 0.86,
          source: 'rules',
          label: '本地知识问答',
          reason: '问题指向用户自己的笔记、项目、任务或知识库。'
        },
        { id: 'route-vault' }
      ),
      ev(
        'runtime.context',
        {
          lane: 'retrieval',
          status: 'completed',
          label: '检索上下文已就绪',
          detail: '检索上下文已进入本轮提示词。',
          evidenceCount: 3,
          sourceCount: 2,
          tokenEstimate: 640
        },
        { id: 'context-retrieval' }
      ),
      ev(
        'runtime.route_escalation',
        {
          from: 'direct_answer',
          to: 'vault_qa',
          reason: '短预算检索找到了本地证据。',
          trigger: 'retrieval_evidence'
        },
        { id: 'route-escalation' }
      )
    ]);

    expect(html).toContain('已接收');
    expect(html).toContain('意图：本地知识问答');
    expect(html).toContain('检索上下文已就绪');
    expect(html).toContain('证据 3');
    expect(html).toContain('路由升级：直接回答 → 本地知识问答');
  });

  it('does not render approval controls when tool approval is unsupported', () => {
    const html = render([
      ev(
        'runtime.tool_use',
        { toolName: 'orbit_search', toolInput: { query: 'project' }, spanId: 'toolu_1' },
        { id: 'tu1', spanId: 'toolu_1' }
      )
    ]);

    expect(html).not.toContain('批准');
    expect(html).not.toContain('拒绝');
  });

  it('renders external path approval as an actionable awaiting-user card', () => {
    const html = render(
      [
        ev(
          'runtime.awaiting_user',
          {
            kind: 'external_path_access',
            status: 'pending',
            proposalId: 'prop_external',
            title: '允许读取外部路径？',
            targetPath: '/Users/ryan/outside',
            hint: '在此对话或收件箱批准后继续。'
          },
          { id: 'await-external', spanId: 'prop_external' }
        )
      ],
      { ...DEFAULT_CHAT_HOST_CAPABILITIES, canApproveTool: true }
    );

    expect(html).toContain('允许读取外部路径？');
    expect(html).toContain('/Users/ryan/outside');
    expect(html).toContain('允许读取');
    expect(html).toContain('拒绝');
  });

  it('renders task proposals as actionable approval cards', () => {
    const html = render(
      [
        ev(
          'runtime.awaiting_user',
          {
            kind: 'new_task',
            status: 'pending',
            proposalId: 'prop_task',
            title: '批准任务：标签与收尾',
            hint: '在此处或收件箱批准后创建此任务。'
          },
          { id: 'await-task', spanId: 'prop_task' }
        )
      ],
      { ...DEFAULT_CHAT_HOST_CAPABILITIES, canApproveTool: true }
    );

    expect(html).toContain('批准任务：标签与收尾');
    expect(html).toContain('批准');
    expect(html).toContain('拒绝');
  });

  it('merges external path approval status updates by proposal id', () => {
    const html = render(
      [
        ev(
          'runtime.awaiting_user',
          {
            kind: 'external_path_access',
            status: 'pending',
            proposalId: 'prop_external',
            title: '允许读取外部路径？',
            targetPath: '/Users/ryan/outside',
            hint: '在此对话或收件箱批准后继续。'
          },
          { id: 'await-external', spanId: 'prop_external' }
        ),
        ev(
          'runtime.awaiting_user',
          {
            kind: 'external_path_access',
            status: 'approved',
            proposalId: 'prop_external',
            hint: '已批准。继续执行。'
          },
          { id: 'await-external-approved', spanId: 'prop_external' }
        )
      ],
      { ...DEFAULT_CHAT_HOST_CAPABILITIES, canApproveTool: true }
    );

    expect(html).toContain('已批准');
    expect(html).toContain('已批准。继续执行。');
    expect(html.match(/允许读取外部路径/g)?.length).toBe(1);
    expect(html).not.toContain('允许读取</button>');
    expect(html).not.toContain('拒绝');
  });

  it('hides thinking blocks when capability disabled', () => {
    const html = render([ev('runtime.thinking', { text: 'pondering' })], {
      ...DEFAULT_CHAT_HOST_CAPABILITIES,
      supportsThinking: false
    });
    expect(html).not.toContain('pondering');
  });

  it('skips empty runtime text placeholders', () => {
    const html = render([
      ev('runtime.message', { text: '   ' }, { id: 'm-empty' }),
      ev('runtime.thinking', { text: '' }, { id: 't-empty' }),
      ev('runtime.message', { text: 'real reply' }, { id: 'm-real' })
    ]);

    expect(html).toContain('real reply');
    expect(html.match(/>Agent</g)?.length).toBe(1);
    expect(html).not.toContain('Thinking</summary>');
  });

  it('disables Send when canSendMessage is false', () => {
    const html = render([], { ...DEFAULT_CHAT_HOST_CAPABILITIES, canSendMessage: false });
    expect(html).toMatch(/<textarea[^>]*disabled/);
  });

  it('renders welcome message when events are empty', () => {
    const html = renderToStaticMarkup(
      createElement(ChatView, {
        conversationId: 'c1',
        capabilities: DEFAULT_CHAT_HOST_CAPABILITIES,
        events: [],
        isLoading: false,
        onAction: () => {},
        welcomeMessage: 'Hi there!'
      })
    );
    expect(html).toContain('Hi there!');
  });

  it('treats near-bottom scroll positions as auto-follow eligible', () => {
    expect(
      isChatScrollerNearBottom({
        scrollTop: 452,
        scrollHeight: 1000,
        clientHeight: 500
      })
    ).toBe(true);
    expect(
      isChatScrollerNearBottom({
        scrollTop: 400,
        scrollHeight: 1000,
        clientHeight: 500
      })
    ).toBe(false);
    expect(CHAT_AUTOSCROLL_THRESHOLD_PX).toBe(48);
  });
});
