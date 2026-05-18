import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultRedditFeedProvider, normalizeRedditSource } from '../src/main/feed/reddit';

let tmp: string | null = null;

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = null;
});

describe('Reddit feed provider', () => {
  it('normalizes subreddit names and URLs', () => {
    expect(normalizeRedditSource('r/LocalLLaMA/new')).toEqual({
      url: 'https://www.reddit.com/r/LocalLLaMA/new/',
      source_type: 'subreddit',
      subreddit: 'LocalLLaMA',
      sort: 'new'
    });
    expect(normalizeRedditSource('https://old.reddit.com/r/programming/top/')).toEqual({
      url: 'https://www.reddit.com/r/programming/top/',
      source_type: 'subreddit',
      subreddit: 'programming',
      sort: 'top'
    });
  });

  it('calls OpenCLI subreddit listing and parses Reddit post candidates', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-reddit-provider-'));
    const originalPath = process.env.PATH;
    const fakeOpenCli = path.join(tmp, 'opencli');
    await writeFile(
      fakeOpenCli,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.join(' ') !== 'reddit subreddit LocalLLaMA --sort new --limit 20 -f json') {
  console.error('unexpected args: ' + args.join(' '));
  process.exit(64);
}
console.log(JSON.stringify([
  {
    id: '1abc123',
    title: 'Open local-first readers',
    author: 'u/orbit_user',
    upvotes: 128,
    comments: 42,
    url: 'https://www.reddit.com/r/LocalLLaMA/comments/1abc123/open_local_first_readers/'
  }
]));`,
      'utf8'
    );
    await chmod(fakeOpenCli, 0o755);
    process.env.PATH = `${tmp}${path.delimiter}${originalPath ?? ''}`;

    try {
      const posts = await defaultRedditFeedProvider.listCandidates(normalizeRedditSource('r/LocalLLaMA/new'), { limit: 20 });
      expect(posts).toEqual([
        expect.objectContaining({
          id: '1abc123',
          title: 'Open local-first readers',
          author: 'orbit_user',
          subreddit: 'LocalLLaMA',
          canonical_url: 'https://www.reddit.com/r/LocalLLaMA/comments/1abc123/open_local_first_readers/',
          score: 128,
          comments: 42
        })
      ]);
    } finally {
      process.env.PATH = originalPath;
    }
  });
});
