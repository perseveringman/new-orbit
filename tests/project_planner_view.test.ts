import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProjectPlannerView } from '../src/renderer/src/views/ProjectPlannerView';

describe('ProjectPlannerView', () => {
  it('starts as a planner chat workspace before an artifact exists', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectPlannerView, { projectUid: 'project-1' })
    );

    expect(html).toContain('Planning Chat');
    expect(html).toContain('Plan Agent');
    expect(html).toContain('Generate Task Split');
    expect(html).toContain('No task split artifact yet');
    expect(html).not.toContain('Task Split Artifact');
  });
});
