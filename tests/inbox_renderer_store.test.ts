import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboxCountSummary, InboxEvent, InboxItem, InboxListResult } from '../src/shared/inbox';

const mockList = vi.fn();
const mockOnEvent = vi.fn();

(globalThis as unknown as { window: Record<string, unknown> }).window = {
  orbit: {
    inbox: {
      list: mockList,
      onEvent: mockOnEvent
    }
  }
} as Record<string, unknown>;

const { useInbox } = await import('../src/renderer/src/store/inbox');

describe('renderer inbox store', () => {
  beforeEach(() => {
    useInbox.getState().teardown();
    useInbox.setState({
      items: [],
      counts: emptyCounts(),
      loading: false,
      error: null,
      unsubscribe: null
    });
    mockList.mockReset();
    mockOnEvent.mockReset();
  });

  it('hydrates shared counts from the inbox list bridge', async () => {
    mockList.mockResolvedValue(listResult([message('msg-1')]));
    mockOnEvent.mockReturnValue(() => undefined);

    useInbox.getState().init();
    await flush();

    expect(useInbox.getState().counts.sidebarMessagesPending).toBe(1);
  });

  it('optimistically increments counts when a new message event arrives', async () => {
    let listener: ((event: InboxEvent) => void) | undefined;
    mockList
      .mockResolvedValueOnce(listResult([message('msg-1'), message('msg-2')]))
      .mockResolvedValueOnce(listResult([message('msg-1'), message('msg-2'), message('msg-3')]));
    mockOnEvent.mockImplementation((cb) => {
      listener = cb;
      return () => undefined;
    });

    useInbox.getState().init();
    await flush();
    listener?.({ type: 'created', item: message('msg-3') });

    expect(useInbox.getState().counts.sidebarMessagesPending).toBe(3);
    await flush();
    expect(useInbox.getState().counts.messagesPending).toBe(3);
  });
});

function message(id: string): InboxItem {
  return {
    id,
    category: 'message',
    subtype: 'B1',
    title: id,
    summary: id,
    context: {},
    payload: {},
    status: 'pending',
    created_at: '2026-04-26T10:00:00.000Z',
    updated_at: '2026-04-26T10:00:00.000Z'
  };
}

function listResult(items: InboxItem[]): InboxListResult {
  return {
    items,
    counts: {
      ...emptyCounts(),
      sidebarMessagesPending: items.length,
      messagesPending: items.length
    }
  };
}

function emptyCounts(): InboxCountSummary {
  return {
    sidebarMessagesPending: 0,
    messagesPending: 0,
    captureLibraryUnread: 0,
    feedCount: 0
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
