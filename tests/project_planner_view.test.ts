import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProjectPlannerView } from '../src/renderer/src/views/ProjectPlannerView';

describe('ProjectPlannerView', () => {
  it('starts as a planner chat workspace before an artifact exists', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectPlannerView, { projectUid: 'project-1' })
    );

    expect(html).toContain('规划对话');
    expect(html).toContain('计划 Agent');
    expect(html).toContain('生成任务拆分');
    expect(html).toContain('还没有任务拆分工件');
    expect(html).not.toContain('任务工件版本 1');
  });
});
