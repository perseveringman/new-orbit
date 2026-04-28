import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createArea, assignArea, getAreaDashboard, suggestAreaAssignments } from '../src/main/area';
import { createNoteStore } from '../src/main/note/store';
import { createLibraryStore } from '../src/main/library/store';
import { createResourceStore } from '../src/main/resource/store';
import { createFeedStore } from '../src/main/feed/store';
import { createProject } from '../src/main/project';
import { createSynthesisStore } from '../src/main/synthesis/store';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-area-'));
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('Area Phase 6.6 foundation', () => {
  it('assembles a dashboard dynamically from assigned Layer 1 entities', async () => {
    const areaResult = await createArea(vaultPath, {
      slug: 'learning',
      name: 'Learning',
      tags: ['pkm']
    });
    const areaRef = {
      area_slug: 'learning',
      primary: true,
      assigned_at: '2026-04-28T00:00:00.000Z',
      assigned_by: 'user' as const
    };

    await createNoteStore(vaultPath).create({
      type: 'thought',
      title: 'PKM note',
      body: 'A note about personal knowledge management.',
      tags: ['pkm'],
      areas: [areaRef]
    });
    await createLibraryStore(vaultPath).save({
      title: 'PKM article',
      url: 'https://example.com/pkm',
      tags: ['pkm'],
      areas: [areaRef]
    });
    await createResourceStore(vaultPath).create({
      title: 'PKM',
      tags: ['pkm'],
      areas: [areaRef]
    });
    await createFeedStore(vaultPath).createSource({
      title: 'Learning feed',
      url: 'https://example.com/feed.xml',
      areas: [areaRef]
    });
    await createProject(vaultPath, {
      slug: 'learning-project',
      name: 'Learning Project',
      template: 'blank',
      area_uid: areaResult.uid
    });

    const dashboard = await getAreaDashboard(vaultPath, 'learning');

    expect(dashboard.area.slug).toBe('learning');
    expect(dashboard.stats.active_projects).toBe(1);
    expect(dashboard.stats.resources).toBe(1);
    expect(dashboard.stats.recent_notes).toBe(1);
    expect(dashboard.stats.library_items).toBe(1);
    expect(dashboard.stats.feed_sources).toBe(1);
    expect(dashboard.health.score).toBeGreaterThan(60);
  });

  it('assigns unassigned notes and projects, then removes them from the queue', async () => {
    await createArea(vaultPath, { slug: 'systems', name: 'Systems', tags: ['systems'] });
    const note = await createNoteStore(vaultPath).create({
      type: 'thought',
      title: 'Systems thinking',
      body: 'Feedback loops and operations.',
      tags: ['systems']
    });
    const project = await createProject(vaultPath, {
      slug: 'ops-handbook',
      name: 'Ops Handbook',
      template: 'blank'
    });

    expect((await getAreaDashboard(vaultPath, 'systems')).unassigned_queue.map((item) => item.id)).toEqual(
      expect.arrayContaining([note.frontmatter.id, project.uid])
    );

    await assignArea(vaultPath, {
      entity: { kind: 'note', id: note.frontmatter.id, title: note.frontmatter.title },
      area: { area_slug: 'systems', primary: true, assigned_at: '2026-04-28T00:00:00.000Z', assigned_by: 'user' }
    });
    await assignArea(vaultPath, {
      entity: { kind: 'project', id: project.uid, title: 'Ops Handbook' },
      area: { area_slug: 'systems', primary: true, assigned_at: '2026-04-28T00:00:00.000Z', assigned_by: 'user' }
    });

    const dashboard = await getAreaDashboard(vaultPath, 'systems');
    expect(dashboard.recent_notes.map((item) => item.frontmatter.id)).toContain(note.frontmatter.id);
    expect(dashboard.active_projects.map((item) => item.uid)).toContain(project.uid);
    expect(dashboard.unassigned_queue.map((item) => item.id)).not.toContain(note.frontmatter.id);
    expect(dashboard.unassigned_queue.map((item) => item.id)).not.toContain(project.uid);
  });

  it('suggests assignments through classify.area synthesis artifacts', async () => {
    await createArea(vaultPath, { slug: 'health-systems', name: 'Health Systems', tags: ['health'] });
    await createArea(vaultPath, { slug: 'finance', name: 'Finance', tags: ['money'] });
    const note = await createNoteStore(vaultPath).create({
      type: 'thought',
      title: 'Health habit system',
      body: 'A repeatable health routine and sleep system.',
      tags: ['health']
    });

    const suggestions = await suggestAreaAssignments(vaultPath, {
      kind: 'note',
      id: note.frontmatter.id,
      title: note.frontmatter.title
    });

    expect(suggestions[0]).toMatchObject({
      area_slug: 'health-systems',
      entity: { kind: 'note', id: note.frontmatter.id }
    });
    expect(suggestions[0]?.synthesis_ref).toMatch(/^synth-/);
    const artifact = await createSynthesisStore(vaultPath).get(suggestions[0]!.synthesis_ref!);
    expect(artifact?.kind).toBe('classify.area');
  });
});
