import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TaskDetailsModal } from '../src/renderer/src/components/Modals/TaskDetailsModal';

describe('TaskDetailsModal', () => {
  it('renders a dialog chrome around task details content', () => {
    const html = renderToStaticMarkup(
      createElement(
        TaskDetailsModal,
        {
          open: true,
          title: 'Ship CLI',
          detail: '01_Projects/twitter/.agent/tasks/ship-cli.md',
          onClose: vi.fn()
        },
        createElement('div', null, 'Task editor body')
      )
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('Ship CLI');
    expect(html).toContain('Task editor body');
  });

  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      createElement(
        TaskDetailsModal,
        { open: false, title: 'Hidden', onClose: vi.fn() },
        createElement('div', null, 'Hidden body')
      )
    );

    expect(html).toBe('');
  });
});
