import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLibraryService } from '../src/main/capture';
import type { ActivityEventInput } from '../src/main/activity';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = path.join(process.cwd(), 'test-results', 'library-promote', randomUUID());
  await fs.mkdir(vaultPath, { recursive: true });
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('library promote', () => {
  it('promotes a saved article to 03_Resources with a no-AI fallback', async () => {
    const activities: ActivityEventInput[] = [];
    const service = createLibraryService(vaultPath, {
      now: () => new Date('2026-04-26T10:00:00.000Z'),
      emitActivity: (event) => activities.push(event)
    });
    const article = await service.saveArticle({ url: 'https://example.com/article', title: 'Readable Article', content: '# Readable Article\n\nOriginal content.' });

    const promoted = await service.promote(article.id, { noAiSummary: true });
    const resource = await fs.readFile(promoted.resourcePath, 'utf8');

    expect(promoted.item.status).toBe('processed');
    expect(path.relative(vaultPath, promoted.resourcePath)).toBe(path.join('03_Resources', 'readable-article.md'));
    expect(resource).toContain('AI summary intentionally skipped.');
    expect(resource).toContain('Original content.');
    expect(activities.map((event) => event.action)).toEqual(['library.article_saved', 'library.article_promoted']);
  });
});
