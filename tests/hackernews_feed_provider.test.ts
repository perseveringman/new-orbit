import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultHackerNewsFeedProvider, normalizeHackerNewsSource } from '../src/main/feed/hackernews';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Hacker News feed provider', () => {
  it('normalizes listing names and URLs', () => {
    expect(normalizeHackerNewsSource('hn:show')).toEqual({
      url: 'https://news.ycombinator.com/show',
      source_type: 'show'
    });
    expect(normalizeHackerNewsSource('https://news.ycombinator.com/newest')).toEqual({
      url: 'https://news.ycombinator.com/newest',
      source_type: 'new'
    });
  });

  it('fetches public API story IDs and normalizes stable HN candidates', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.endsWith('/showstories.json')) {
        return jsonResponse([44556677]);
      }
      if (href.endsWith('/item/44556677.json')) {
        return jsonResponse({
          id: 44556677,
          type: 'story',
          by: 'hn_user',
          title: 'Show HN: Local-first capture inbox',
          url: 'https://example.com/hn-local-first',
          score: 320,
          descendants: 88,
          time: 1779094800
        });
      }
      return jsonResponse(null, 404);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const stories = await defaultHackerNewsFeedProvider.listCandidates(normalizeHackerNewsSource('hn:show'), { limit: 20 });

    expect(fetchMock).toHaveBeenCalledWith('https://hacker-news.firebaseio.com/v0/showstories.json', {
      headers: { accept: 'application/json' }
    });
    expect(stories).toEqual([
      expect.objectContaining({
        id: '44556677',
        title: 'Show HN: Local-first capture inbox',
        author: 'hn_user',
        url: 'https://example.com/hn-local-first',
        canonical_url: 'https://news.ycombinator.com/item?id=44556677',
        outbound_url: 'https://example.com/hn-local-first',
        score: 320,
        comments: 88,
        published_at: '2026-05-18T09:00:00.000Z'
      })
    ]);
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
