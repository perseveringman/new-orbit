import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createAnnotationStore } from '../src/main/annotation/store';

const tempDirs: string[] = [];

async function tempVault(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'orbit-annotations-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('AnnotationStore', () => {
  it('persists annotations by target and view state by space', async () => {
    const vault = await tempVault();
    const store = createAnnotationStore(vault);
    const target = { kind: 'library_item' as const, ref: 'lib-1', title_snapshot: '资料 A' };

    const annotation = await store.create({
      target,
      anchor: { kind: 'whole_source' },
      type: 'resource_note',
      color: 'yellow',
      body_markdown: '## 资料标注\n\n记录'
    });

    await store.updateViewState('library-workbench', annotation.id, {
      position: { x: 120, y: 90 },
      size: { width: 390, height: 310 },
      z_index: 180,
      status: 'open'
    });

    const byTarget = await store.listForTarget(target);
    expect(byTarget).toHaveLength(1);
    expect(byTarget[0]?.id).toBe(annotation.id);

    const viewStates = await store.listViewStates('library-workbench');
    expect(viewStates[0]).toMatchObject({
      annotation_id: annotation.id,
      position: { x: 120, y: 90 },
      z_index: 180
    });

    await store.archive(annotation.id);
    expect(await store.listForTarget(target)).toHaveLength(0);
    expect(await store.listForTarget(target, true)).toHaveLength(1);
  });

  it('returns child annotations through the parent context target', async () => {
    const vault = await tempVault();
    const store = createAnnotationStore(vault);
    const libraryTarget = { kind: 'library_item' as const, ref: 'lib-1' };
    const parent = await store.create({
      target: libraryTarget,
      anchor: { kind: 'text_quote', quote: { exact: 'source text' } },
      type: 'comment',
      body_markdown: 'parent'
    });

    const child = await store.create({
      target: { kind: 'annotation', ref: parent.id },
      context_target: libraryTarget,
      anchor: { kind: 'annotation_body_range', quote: { exact: 'child text' } },
      type: 'comment',
      parent_annotation_id: parent.id,
      body_markdown: 'child'
    });

    const records = await store.listForTarget(libraryTarget);
    expect(records.map((record) => record.id).sort()).toEqual([child.id, parent.id].sort());
  });
});
