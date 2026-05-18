import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultXFeedProvider, normalizeXSource } from '../src/main/feed/x';

let tmp: string | null = null;

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = null;
});

describe('X feed provider', () => {
  it('normalizes handles and profile URLs', () => {
    expect(normalizeXSource('@jakevin7')).toEqual({
      url: 'https://x.com/jakevin7',
      handle: 'jakevin7',
      source_type: 'profile'
    });
    expect(normalizeXSource('https://twitter.com/jakevin7')).toEqual({
      url: 'https://x.com/jakevin7',
      handle: 'jakevin7',
      source_type: 'profile'
    });
  });

  it('calls OpenCLI search with from:handle and parses recent posts', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-x-provider-'));
    const originalPath = process.env.PATH;
    const fakeOpenCli = path.join(tmp, 'opencli');
    await writeFile(
      fakeOpenCli,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.join(' ') !== 'twitter search from:jakevin7 --filter live --limit 20 -f json') {
  console.error('unexpected args: ' + args.join(' '));
  process.exit(64);
}
console.log(JSON.stringify([
  {
    id: '2056340861773136121',
    author: 'jakevin7',
    text: 'OpenCLI supports X feeds',
    created_at: 'Mon May 18 11:47:21 +0000 2026',
    likes: 24,
    views: '3011',
    url: 'https://x.com/i/status/2056340861773136121'
  }
]));`,
      'utf8'
    );
    await chmod(fakeOpenCli, 0o755);
    process.env.PATH = `${tmp}${path.delimiter}${originalPath ?? ''}`;

    try {
      const posts = await defaultXFeedProvider.listCandidates(normalizeXSource('@jakevin7'), { limit: 20 });
      expect(posts).toEqual([
        expect.objectContaining({
          id: '2056340861773136121',
          author: 'jakevin7',
          canonical_url: 'https://x.com/jakevin7/status/2056340861773136121',
          published_at: '2026-05-18T11:47:21.000Z',
          views: 3011,
          is_reply: false
        })
      ]);
    } finally {
      process.env.PATH = originalPath;
    }
  });
});
