import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { InboxEvent, InboxItem } from '../src/shared/inbox';
import {
  applyInboxBadgeEvent,
  isPrimaryWorkspaceDestination,
  pendingMessageIdsFromItems,
  WorkspaceOverflowMenu,
  WorkspaceQuickItem,
  workspaceBadgeCount
} from '../src/renderer/src/components/Sidebar/ProjectsNav';
import { ResourcesNav } from '../src/renderer/src/components/Sidebar/ResourcesNav';
import { WORKSPACE_DESTINATIONS, type WorkspaceDestination } from '../src/renderer/src/components/topbarModel';

describe('ProjectsNav inbox badge', () => {
  it('keeps only the requested high-level destinations in the primary sidebar list', () => {
    const primaryLabels = ['dashboard', 'askAnywhere', 'inbox', 'timeline', 'review'].map(
      (kind) => WORKSPACE_DESTINATIONS.find((destination) => destination.view.kind === kind)?.label
    );

    expect(primaryLabels).toEqual([
      'Dashboard',
      'Ask Anywhere',
      'Inbox',
      'Timeline',
      'Review'
    ]);
  });

  it('renders non-primary workspace destinations under the More menu', () => {
    const overflow = WORKSPACE_DESTINATIONS.filter(
      (destination) => !isPrimaryWorkspaceDestination(destination) && destination.view.kind !== 'resources'
    );
    const html = renderToStaticMarkup(
      createElement(WorkspaceOverflowMenu, {
        destinations: overflow,
        view: { kind: 'vision' },
        inboxPendingCount: 0,
        defaultOpen: true,
        onSelect: () => undefined
      })
    );

    expect(html).toContain('More');
    expect(html).toContain('Vision');
    expect(html).toContain('Library');
    expect(html).toContain('Agents');
    expect(html).not.toContain('Dashboard');
    expect(html).not.toContain('Resources');
  });

  it('renders Resources as its own sidebar list section', () => {
    const html = renderToStaticMarkup(createElement(ResourcesNav));

    expect(html).toContain('Resources');
    expect(html).toContain('New resource');
    expect(html).toContain('No resources yet');
  });

  it('returns sidebar pending count only for the Inbox destination', () => {
    const inbox: WorkspaceDestination = { label: 'Inbox', view: { kind: 'inbox' }, icon: '📥' };
    const dashboard: WorkspaceDestination = {
      label: 'Dashboard',
      view: { kind: 'dashboard' },
      icon: '◎'
    };

    expect(workspaceBadgeCount(inbox, 3)).toBe(3);
    expect(workspaceBadgeCount(dashboard, 3)).toBe(0);
  });

  it('renders a red badge for pending Inbox messages', () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceQuickItem, {
        destination: { label: 'Inbox', view: { kind: 'inbox' }, icon: '📥' },
        active: false,
        badgeCount: 3,
        onClick: () => undefined
      })
    );

    expect(html).toContain('Inbox');
    expect(html).toContain('bg-red-500');
    expect(html).toContain('h-5 w-5');
    expect(html).toContain('>3<');
  });

  it('tracks pending message ids from inbox events without losing concurrent creates', () => {
    const first = messageItem('message-1', 'pending');
    const second = messageItem('message-2', 'pending');
    let ids = pendingMessageIdsFromItems([first]);

    ids = applyInboxBadgeEvent(ids, { type: 'created', item: second });
    expect([...ids].sort()).toEqual(['message-1', 'message-2']);

    ids = applyInboxBadgeEvent(ids, {
      type: 'resolved',
      item: { ...first, status: 'resolved' }
    });
    expect([...ids]).toEqual(['message-2']);
  });
});

function messageItem(id: string, status: InboxItem['status']): InboxItem {
  return {
    id,
    category: 'message',
    subtype: 'B1',
    title: id,
    summary: id,
    context: {},
    payload: {},
    status,
    created_at: '2026-04-26T10:00:00.000Z',
    updated_at: '2026-04-26T10:00:00.000Z'
  };
}
