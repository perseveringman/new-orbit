import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { InboxItem } from '../src/shared/inbox';
import { summarizeInboxCounts } from '../src/shared/inbox';
import { InboxShellContent } from '../src/renderer/src/components/inbox/InboxShell';
import { StageView } from '../src/renderer/src/components/inbox/stage/StageView';

const items: InboxItem[] = [
  {
    id: 'inbox_a2',
    category: 'message',
    subtype: 'A2',
    title: 'Create follow-up task',
    summary: 'Agent proposed an independently valuable task.',
    context: { proposal_id: 'prop_a2' },
    payload: { proposal_id: 'prop_a2', proposal_type: 'new_task', payload: { title: 'Follow-up' } },
    status: 'pending',
    created_at: '2026-04-26T10:00:00.000Z',
    updated_at: '2026-04-26T10:00:00.000Z'
  },
  {
    id: 'library_1',
    category: 'capture',
    subtype: 'library_article',
    title: 'Read this article',
    summary: 'High-signal reading queue item.',
    context: {},
    payload: {
      url: 'https://example.com',
      title: 'Read this article',
      source: 'manual',
      estimated_reading_minutes: 4,
      total_reading_seconds: 0
    },
    status: 'unread',
    created_at: '2026-04-26T10:01:00.000Z',
    updated_at: '2026-04-26T10:01:00.000Z'
  }
];

describe('Inbox v2 renderer shell', () => {
  it('renders top-level tabs and message Stage View markup', () => {
    const html = renderToStaticMarkup(
      createElement(InboxShellContent, {
        items,
        counts: summarizeInboxCounts(items),
        activePrimary: 'messages',
        activeCapture: 'library',
        selectedId: 'inbox_a2',
        onPrimaryChange: vi.fn(),
        onCaptureChange: vi.fn(),
        onSelect: vi.fn()
      })
    );

    expect(html).toContain('Inbox v2');
    expect(html).toContain('Capture');
    expect(html).toContain('Messages');
    expect(html).toContain('Archive');
    expect(html).toContain('Create follow-up task');
    expect(html).toContain('Authorization chain');
  });

  it('renders Library article Stage View markup', () => {
    const html = renderToStaticMarkup(createElement(StageView, { item: items[1] }));
    expect(html).toContain('Library');
    expect(html).toContain('Loading article');
    expect(html).toContain('Promote to Resource');
  });
});
