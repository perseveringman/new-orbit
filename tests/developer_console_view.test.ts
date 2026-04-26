import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DeveloperConsoleView } from '../src/renderer/src/views/DeveloperConsoleView';

describe('DeveloperConsoleView', () => {
  it('renders event replay filters and payload panel', () => {
    const html = renderToStaticMarkup(createElement(DeveloperConsoleView));
    expect(html).toContain('Event Replay');
    expect(html).toContain('All sources');
    expect(html).toContain('Payload');
  });
});
