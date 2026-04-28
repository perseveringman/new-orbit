import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RuntimeEvent, RuntimeEventKind, RuntimeEventPayloadMap } from '../src/shared/chat-protocol';
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
    expect(html).toContain('Read');
    expect(html).toContain('done');
    // ToolCard renders the toolName once when paired (no orphan tool_result block)
    const matches = html.match(/font-mono font-semibold[^>]*>Read</g);
    expect(matches?.length).toBe(1);
  });

  it('hides thinking blocks when capability disabled', () => {
    const html = render(
      [ev('runtime.thinking', { text: 'pondering' })],
      { ...DEFAULT_CHAT_HOST_CAPABILITIES, supportsThinking: false }
    );
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
