import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createResourceStore } from '../src/main/resource/store';
import { createTask } from '../src/main/project';
import { tasksOfFile } from '../src/main/tasks';
import {
  RESOURCE_ROOM_TABS,
  ResourceOverview,
  ResourceView,
  type ResourceViewProps
} from '../src/renderer/src/views/ResourceView';
import type { Resource } from '../src/shared/resource';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-resource-space-'));
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('资源空间 integration', () => {
  it('creates resource-owned tasks under the Resource tasks directory', async () => {
    const resource = await createResourceStore(vaultPath).create({ title: 'Embodied Cognition' });
    const created = await createTask(vaultPath, {
      resource_uid: resource.frontmatter.id,
      title: 'Extract open questions'
    });
    const raw = await fs.readFile(created.taskPath, 'utf8');
    const parsed = tasksOfFile(created.taskPath, created.relPath, raw);

    expect(created.relPath).toMatch(/^03_Resources\/embodied-cognition\/tasks\//);
    expect(parsed[0]).toMatchObject({
      title: 'Extract open questions',
      resource_uid: resource.frontmatter.id
    });
  });

  it('exposes 资源空间 room tabs', () => {
    expect(RESOURCE_ROOM_TABS.map((tab) => tab.id)).toEqual([
      'overview',
      'kanban',
      'materials',
      'outputs',
      'chat',
      'timeline'
    ]);
  });

  it('can render a Resource Room without the legacy inner resource list', () => {
    const html = renderToStaticMarkup(
      createElement<ResourceViewProps>(ResourceView, { showResourceList: false })
    );

    expect(html).toContain('请从侧边栏选择一个 Resource。');
    expect(html).not.toContain('Knowledge Spaces for long-lived interests.');
    expect(html).not.toContain('Suggest from Notes');
  });

  it('renders the Resource overview as a Space dashboard', () => {
    const resource: Resource = {
      frontmatter: {
        id: 'resource_llm_agents',
        type: 'resource',
        title: 'LLM Agents',
        slug: 'llm-agents',
        status: 'active',
        depth: 'exploring',
        created: '2026-05-09T00:00:00.000Z',
        updated: '2026-05-09T00:00:00.000Z',
        engagement_count: 3,
        tags: ['ai', 'agents'],
        areas: [
          {
            area_slug: 'engineering',
            primary: true,
            assigned_at: '2026-05-09T00:00:00.000Z',
            assigned_by: 'user'
          }
        ]
      },
      path: '03_Resources/llm-agents/index.md',
      counts: {
        canonical: 1,
        distilled: 0,
        related: 1,
        people: 0,
        projects_touched: 0,
        timeline: 1
      },
      body: 'Research notes for agentic coding workflows.',
      refs: [
        {
          id: 'ref_canonical',
          kind: 'note',
          ref: 'notes/agents.md',
          title: 'Agent notes',
          section: 'canonical',
          added_at: '2026-05-09T00:00:00.000Z'
        },
        {
          id: 'ref_related',
          kind: 'url',
          ref: 'https://example.com',
          title: 'Agent article',
          section: 'related',
          added_at: '2026-05-09T00:00:00.000Z'
        }
      ],
      timeline: [
        {
          id: 'timeline_created',
          at: '2026-05-09T00:00:00.000Z',
          kind: 'created',
          title: 'Created resource',
          summary: 'Seeded the dashboard.'
        }
      ]
    };

    const html = renderToStaticMarkup(
      createElement(ResourceOverview, {
        resource,
        scopedChatMessage: null,
        onReload: () => undefined
      })
    );

    expect(html).toContain('Resource 空间');
    expect(html).toContain('03_Resources/llm-agents');
    expect(html).toContain('当前理解');
    expect(html).toContain('最新动态');
    expect(html).toContain('主 Area');
    expect(html).not.toContain('grid-cols-[1fr_360px]');
  });
});
