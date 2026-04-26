import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkspaceQuickItem, workspaceBadgeCount } from '../src/renderer/src/components/Sidebar/ProjectsNav';
import type { WorkspaceDestination } from '../src/renderer/src/components/topbarModel';

describe('ProjectsNav inbox badge', () => {
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
    expect(html).toContain('>3<');
  });
});
