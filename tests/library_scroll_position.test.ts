import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLibraryService } from '../src/main/capture';
import type { ActivityEventInput } from '../src/main/activity';
import type { LibraryArticlePayload } from '../src/shared/inbox';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = path.join(process.cwd(), 'test-results', 'library-scroll', randomUUID());
  await fs.mkdir(vaultPath, { recursive: true });
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('library scroll position', () => {
  it('persists reading progress and emits read activity when completed', async () => {
    const activities: ActivityEventInput[] = [];
    const service = createLibraryService(vaultPath, {
      now: () => new Date('2026-04-26T10:00:00.000Z'),
      emitActivity: (event) => activities.push(event)
    });
    const article = await service.saveArticle({ url: 'https://example.com/article', title: 'Article', content: '# Article\n\nbody' });

    const reading = await service.updateReading(article.id, { scrollPosition: 0.5, readingSecondsDelta: 12 });
    const read = await service.updateReading(article.id, { scrollPosition: 1, readingSecondsDelta: 8 });
    const payload = read.payload as LibraryArticlePayload;

    expect(reading.status).toBe('reading');
    expect(read.status).toBe('read');
    expect(payload.scroll_position).toBe(1);
    expect(payload.total_reading_seconds).toBe(20);
    expect(activities.map((event) => event.action)).toEqual(['library.article_saved', 'library.article_read']);
  });
});
