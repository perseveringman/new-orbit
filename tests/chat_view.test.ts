import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  RuntimeEvent,
  RuntimeEventKind,
  RuntimeEventPayloadMap
} from '../src/shared/chat-protocol';
import { DEFAULT_CHAT_HOST_CAPABILITIES } from '../src/shared/chat-protocol';
import { ChatView } from '../src/renderer/src/components/chat/ChatView';

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

function render(events: RuntimeEvent[], capabilities = DEFAULT_CHAT_HOST_CAPABILITIES): string {
  return renderToStaticMarkup(
    createElement(ChatView, {
      conversationId: 'c1',
      capabilities,
      events,
      isLoading: false,
      onAction: () => {}
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
});
