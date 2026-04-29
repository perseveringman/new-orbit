import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLibraryStore } from '../src/main/library/store';
import { createNoteStore } from '../src/main/note/store';
import { discoverReviewFindings } from '../src/main/review/discovery';
import { reviewPeriod, REVIEW_SYSTEM_TASKS } from '../src/main/review/scheduler';
import { createReviewStore } from '../src/main/review/store';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-review-'));
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('Review System', () => {
  it('declares the required review system tasks', () => {
    expect(REVIEW_SYSTEM_TASKS.map((task) => task.id)).toEqual(['daily-review', 'weekly-review', 'monthly-review']);
    expect(reviewPeriod('weekly', new Date('2026-04-30T12:00:00.000Z')).from).toBe('2026-04-24T00:00:00.000Z');
  });

  it('generates findings for unassigned notes and undistilled library items', async () => {
    await createNoteStore(vaultPath).create({ type: 'thought', title: 'Floating note', body: 'Needs area' });
    await createLibraryStore(vaultPath).save({ title: 'Read article', body: 'Useful source', kind: 'article' }).then((item) =>
      createLibraryStore(vaultPath).update(item.frontmatter.id, { status: 'read' })
    );
    const run = await createReviewStore(vaultPath).start('weekly', reviewPeriod('weekly'));

    const { findings, health } = await discoverReviewFindings(vaultPath, run);

    expect(findings.map((finding) => finding.category)).toEqual(expect.arrayContaining(['unassigned-note', 'library-undistilled']));
    expect(health.notes.unassigned).toBe(1);
  });

  it('acknowledges findings and executes ignore actions', async () => {
    const store = createReviewStore(vaultPath);
    const run = await store.start('weekly', reviewPeriod('weekly'));
    const { findings } = await discoverReviewFindings(vaultPath, run);
    const completed = await store.complete(run, findings, 'synth-1');

    await store.acknowledge(findings[0].id);
    const acknowledged = await store.getRun(completed.id);
    expect(acknowledged?.findings[0].acknowledged).toBe(true);

    const ignore = acknowledged!.findings[0].suggested_actions.find((action) => action.kind === 'ignore')!;
    const action = await store.executeAction(ignore.id);
    expect(action.executed).toBe(true);
  });

  it('archives review runs for history', async () => {
    const store = createReviewStore(vaultPath);
    const run = await store.start('monthly', reviewPeriod('monthly'));
    await store.archiveRun(run.id);

    const detail = await store.getRun(run.id);
    expect(detail?.run.status).toBe('archived');
  });
});
