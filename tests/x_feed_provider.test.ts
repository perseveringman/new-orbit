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

  it('normalizes timeline sources', () => {
    expect(normalizeXSource('x:following')).toEqual({
      url: 'x://timeline/following',
      source_type: 'timeline',
      timeline_type: 'following'
    });
    expect(normalizeXSource('x:for-you')).toEqual({
      url: 'x://timeline/for-you',
      source_type: 'timeline',
      timeline_type: 'for-you'
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

  it('calls OpenCLI timeline for following and for-you feeds', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-x-timeline-provider-'));
    const originalPath = process.env.PATH;
    const fakeOpenCli = path.join(tmp, 'opencli');
    await writeFile(
      fakeOpenCli,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
const joined = args.join(' ');
if (
  joined !== 'twitter timeline --type following --limit 20 -f json' &&
  joined !== 'twitter timeline --type for-you --limit 20 -f json'
) {
  console.error('unexpected args: ' + joined);
  process.exit(64);
}
const type = args[3];
console.log(JSON.stringify([
  {
    id: type === 'following' ? '2057000000000000001' : '2057000000000000002',
    author: type === 'following' ? 'alice' : 'bob',
    text: type + ' timeline post',
    url: 'https://x.com/i/status/' + (type === 'following' ? '2057000000000000001' : '2057000000000000002')
  }
]));`,
      'utf8'
    );
    await chmod(fakeOpenCli, 0o755);
    process.env.PATH = `${tmp}${path.delimiter}${originalPath ?? ''}`;

    try {
      const following = await defaultXFeedProvider.listCandidates(normalizeXSource('x:following'), { limit: 20 });
      const forYou = await defaultXFeedProvider.listCandidates(normalizeXSource('x:for-you'), { limit: 20 });
      expect(following[0]).toMatchObject({
        id: '2057000000000000001',
        author: 'alice',
        canonical_url: 'https://x.com/alice/status/2057000000000000001'
      });
      expect(forYou[0]).toMatchObject({
        id: '2057000000000000002',
        author: 'bob',
        canonical_url: 'https://x.com/bob/status/2057000000000000002'
      });
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it('retries transient OpenCLI browser tab errors once', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-x-retry-provider-'));
    const originalPath = process.env.PATH;
    const fakeOpenCli = path.join(tmp, 'opencli');
    const marker = path.join(tmp, 'attempted');
    await writeFile(
      fakeOpenCli,
      `#!/usr/bin/env node
const fs = require('node:fs');
const marker = ${JSON.stringify(marker)};
const args = process.argv.slice(2);
if (args.join(' ') !== 'twitter timeline --type following --limit 20 -f json') {
  console.error('unexpected args: ' + args.join(' '));
  process.exit(64);
}
if (!fs.existsSync(marker)) {
  fs.writeFileSync(marker, '1');
  console.error("ok: false\\nerror:\\n  message: 'Pre-navigation to https://x.com failed: No tab with id: 123.'\\n  help: Check that the site is reachable and the browser extension is running.");
  process.exit(1);
}
console.log(JSON.stringify([
  {
    id: '2057000000000000999',
    author: 'alice',
    text: 'retried timeline post',
    url: 'https://x.com/i/status/2057000000000000999'
  }
]));`,
      'utf8'
    );
    await chmod(fakeOpenCli, 0o755);
    process.env.PATH = `${tmp}${path.delimiter}${originalPath ?? ''}`;

    try {
      const posts = await defaultXFeedProvider.listCandidates(normalizeXSource('x:following'), { limit: 20 });
      expect(posts[0]).toMatchObject({
        id: '2057000000000000999',
        author: 'alice',
        canonical_url: 'https://x.com/alice/status/2057000000000000999'
      });
    } finally {
      process.env.PATH = originalPath;
    }
  });
});
