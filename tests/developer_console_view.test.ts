import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DeveloperConsoleView } from '../src/renderer/src/views/DeveloperConsoleView';

describe('DeveloperConsoleView', () => {
  it('renders event replay filters and payload panel', () => {
    const html = renderToStaticMarkup(createElement(DeveloperConsoleView));
    expect(html).toContain('事件回放');
    expect(html).toContain('全部来源');
    expect(html).toContain('载荷');
  });
});
