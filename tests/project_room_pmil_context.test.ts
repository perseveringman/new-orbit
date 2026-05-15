import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkContextReport } from '../src/shared/context';
import type { EvidenceSelector } from '../src/shared/evidence';
import { ProjectPMILContextPanel } from '../src/renderer/src/views/ProjectRoomView';

describe('Project Room PMIL context panel', () => {
  it('renders work context, open loops, decisions, and evidence entry points', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectPMILContextPanel, {
        report: sampleReport(),
        loading: false,
        error: null,
        projectName: 'Orbit PMIL',
        onRefresh: vi.fn()
      })
    );

    expect(html).toContain('项目上下文 · Orbit PMIL');
    expect(html).toContain('Ask Anywhere 引用 PMIL Context Packet');
    expect(html).toContain('活跃线索');
    expect(html).toContain('开放回路');
    expect(html).toContain('决策');
    expect(html).toContain('查看证据');
  });
});

function sampleReport(): WorkContextReport {
  const selector = sampleSelector();
  return {
    work_context: {
      id: 'work-1',
      scope: { kind: 'project', ref: 'project-1' },
      period: { from: '2026-04-16T00:00:00Z', to: '2026-05-16T00:00:00Z' },
      current_focus: 'Ask Anywhere 引用 PMIL Context Packet',
      active_threads: [
        {
          title: 'PMIL 可见上下文',
          summary: '把证据、摘要和开放回路暴露到 Ask 与 Project Room 中。',
          evidence: [selector],
          confidence: 0.84,
          likely_next_steps: ['补齐项目上下文面板并验证证据入口。']
        }
      ],
      decisions: [
        {
          title: '使用 evidence-first 的 Context Packet',
          status: 'made',
          evidence: [selector]
        }
      ],
      open_loops: ['Project Room 需要展示 PMIL 的项目级上下文。']
    },
    open_loops: {
      scope: { kind: 'project', ref: 'project-1' },
      period: { from: '2026-04-16T00:00:00Z', to: '2026-05-16T00:00:00Z' },
      loops: [
        {
          id: 'loop-1',
          title: 'Project Room 需要展示 PMIL 的项目级上下文',
          kind: 'task_candidate',
          status: 'candidate',
          severity: 'suggestion',
          rationale: '海量数据召回需要把综合后的工作上下文直接呈现给用户。',
          evidence: [selector],
          suggested_actions: [{ kind: 'schedule_review' }]
        }
      ]
    },
    evidence: [selector]
  };
}

function sampleSelector(): EvidenceSelector {
  return {
    source_id: 'evidence:note:pmil',
    kind: 'semantic_chunk',
    content_view: 'safe_projection',
    reason: 'PMIL project context'
  };
}
