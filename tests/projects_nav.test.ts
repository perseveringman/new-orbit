import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { InboxEvent, InboxItem } from '../src/shared/inbox';
import {
  applyInboxBadgeEvent,
  isPrimaryWorkspaceDestination,
  pendingMessageIdsFromItems,
  QuickCaptureNavButton,
  WorkspaceOverflowMenu,
  WorkspaceQuickItem,
  workspaceBadgeCount
} from '../src/renderer/src/components/Sidebar/ProjectsNav';
import { ResourcesNav } from '../src/renderer/src/components/Sidebar/ResourcesNav';
import {
  WORKSPACE_DESTINATIONS,
  type WorkspaceDestination
} from '../src/renderer/src/components/topbarModel';

describe('ProjectsNav inbox badge', () => {
  it('keeps only the requested high-level destinations in the primary sidebar list', () => {
    const primaryLabels = ['dashboard', 'askAnywhere', 'inbox', 'timeline', 'review'].map(
      (kind) => WORKSPACE_DESTINATIONS.find((destination) => destination.view.kind === kind)?.label
    );

    expect(primaryLabels).toEqual(['仪表盘', '随处问', '收件箱', '时间线', '复盘']);
  });

  it('renders non-primary workspace destinations under the 更多 menu', () => {
    const overflow = WORKSPACE_DESTINATIONS.filter(
      (destination) =>
        !isPrimaryWorkspaceDestination(destination) && destination.view.kind !== 'resources'
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

    expect(html).toContain('更多');
    expect(html).toContain('愿景');
    expect(html).toContain('资料库');
    expect(html).toContain('角色模板');
    expect(html).not.toContain('仪表盘');
    expect(html).not.toContain('资源');
  });

  it('renders 资源 as its own sidebar list section', () => {
    const html = renderToStaticMarkup(createElement(ResourcesNav));

    expect(html).toContain('资源');
    expect(html).toContain('新建资源');
    expect(html).toContain('还没有资源');
  });

  it('renders a visible quick capture entry in the sidebar', () => {
    const html = renderToStaticMarkup(createElement(QuickCaptureNavButton));

    expect(html).toContain('快速捕获');
    expect(html).toContain('想法、链接、文件');
    expect(html).toContain('⌘⇧I');
  });

  it('returns sidebar pending count only for the 收件箱 destination', () => {
    const inbox: WorkspaceDestination = { label: '收件箱', view: { kind: 'inbox' }, icon: '📥' };
    const dashboard: WorkspaceDestination = {
      label: '仪表盘',
      view: { kind: 'dashboard' },
      icon: '◎'
    };

    expect(workspaceBadgeCount(inbox, 3)).toBe(3);
    expect(workspaceBadgeCount(dashboard, 3)).toBe(0);
  });

  it('renders a red badge for pending 收件箱 messages', () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceQuickItem, {
        destination: { label: '收件箱', view: { kind: 'inbox' }, icon: '📥' },
        active: false,
        badgeCount: 3,
        onClick: () => undefined
      })
    );

    expect(html).toContain('收件箱');
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
