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

  it('fetches and parses X user profiles through OpenCLI', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-x-profile-provider-'));
    const originalPath = process.env.PATH;
    const fakeOpenCli = path.join(tmp, 'opencli');
    await writeFile(
      fakeOpenCli,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.join(' ') !== 'twitter profile claudeai -f json') {
  console.error('unexpected args: ' + args.join(' '));
  process.exit(64);
}
console.log(JSON.stringify([
  {
    screen_name: 'claudeai',
    name: 'Claude',
    bio: 'Claude is an AI assistant.',
    followers: '1373937',
    following: 2,
    tweets: 466,
    verified: true,
    url: 'http://claude.ai',
    profile_image_url_https: 'https://pbs.twimg.com/profile_images/claude_normal.jpg',
    created_at: 'Thu Jul 10 13:50:48 +0000 2025'
  }
]));`,
      'utf8'
    );
    await chmod(fakeOpenCli, 0o755);
    process.env.PATH = `${tmp}${path.delimiter}${originalPath ?? ''}`;

    try {
      await expect(defaultXFeedProvider.fetchProfile?.('claudeai')).resolves.toEqual(
        expect.objectContaining({
          handle: 'claudeai',
          name: 'Claude',
          bio: 'Claude is an AI assistant.',
          followers: 1373937,
          following: 2,
          tweets: 466,
          verified: true,
          url: 'http://claude.ai/',
          profile_url: 'https://x.com/claudeai',
          avatar_url: 'https://pbs.twimg.com/profile_images/claude_normal.jpg',
          created_at: '2025-07-10T13:50:48.000Z'
        })
      );
    } finally {
      process.env.PATH = originalPath;
    }
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

  it('replaces t.co links from X URL entities before storing post text', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-x-entities-provider-'));
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
    text: 'Read this https://t.co/abc123 and this https://t.co/def456',
    url: 'https://x.com/i/status/2056340861773136121',
    entities: {
      urls: [
        {
          url: 'https://t.co/abc123',
          expanded_url: 'https://example.com/article?x=1&y=2',
          display_url: 'example.com/article',
          title: 'Example article'
        },
        {
          url: 'https://t.co/def456',
          expanded_url: 'https://docs.example.com/orbit'
        }
      ]
    }
  }
]));`,
      'utf8'
    );
    await chmod(fakeOpenCli, 0o755);
    process.env.PATH = `${tmp}${path.delimiter}${originalPath ?? ''}`;

    try {
      const posts = await defaultXFeedProvider.listCandidates(normalizeXSource('@jakevin7'), { limit: 20 });
      expect(posts[0].text).toBe('Read this https://example.com/article?x=1&y=2 and this https://docs.example.com/orbit');
      expect(posts[0].text).not.toContain('https://t.co/');
      expect(posts[0].url_entities).toEqual([
        expect.objectContaining({
          url: 'https://t.co/abc123',
          expanded_url: 'https://example.com/article?x=1&y=2',
          display_url: 'example.com/article',
          title: 'Example article',
          resolved_via: 'x_entity'
        }),
        expect.objectContaining({
          url: 'https://t.co/def456',
          expanded_url: 'https://docs.example.com/orbit',
          resolved_via: 'x_entity'
        })
      ]);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it('falls back to bounded t.co redirect resolution when entities are missing', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-x-tco-provider-'));
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
    text: 'No entities here https://t.co/raw123',
    url: 'https://x.com/i/status/2056340861773136121'
  }
]));`,
      'utf8'
    );
    await chmod(fakeOpenCli, 0o755);
    process.env.PATH = `${tmp}${path.delimiter}${originalPath ?? ''}`;
    const resolved: string[] = [];

    try {
      const posts = await defaultXFeedProvider.listCandidates(normalizeXSource('@jakevin7'), {
        limit: 20,
        tco_url_resolver: async (url, options) => {
          resolved.push(`${url}:${options?.timeout_ms ?? 'none'}`);
          return 'https://example.com/from-redirect';
        },
        tco_timeout_ms: 123
      });
      expect(resolved).toEqual(['https://t.co/raw123:123']);
      expect(posts[0].text).toBe('No entities here https://example.com/from-redirect');
      expect(posts[0].url_entities).toEqual([
        expect.objectContaining({
          url: 'https://t.co/raw123',
          expanded_url: 'https://example.com/from-redirect',
          resolved_via: 'tco_redirect'
        })
      ]);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it('uses curl for t.co resolution when the local environment requires an HTTP proxy', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-x-tco-curl-provider-'));
    const originalPath = process.env.PATH;
    const originalHttpsProxy = process.env.https_proxy;
    const fakeOpenCli = path.join(tmp, 'opencli');
    const fakeCurl = path.join(tmp, 'curl');
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
    text: 'Proxy-only link https://t.co/proxy1',
    url: 'https://x.com/i/status/2056340861773136121'
  }
]));`,
      'utf8'
    );
    await writeFile(
      fakeCurl,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (!args.includes('https://t.co/proxy1')) {
  console.error('unexpected curl args: ' + args.join(' '));
  process.exit(64);
}
console.log('HTTP/2 301');
console.log('location: https://example.com/proxy-resolved');
`,
      'utf8'
    );
    await chmod(fakeOpenCli, 0o755);
    await chmod(fakeCurl, 0o755);
    process.env.PATH = `${tmp}${path.delimiter}${originalPath ?? ''}`;
    process.env.https_proxy = 'http://localhost:7897';

    try {
      const posts = await defaultXFeedProvider.listCandidates(normalizeXSource('@jakevin7'), { limit: 20 });
      expect(posts[0].text).toBe('Proxy-only link https://example.com/proxy-resolved');
      expect(posts[0].url_entities).toEqual([
        expect.objectContaining({
          url: 'https://t.co/proxy1',
          expanded_url: 'https://example.com/proxy-resolved',
          resolved_via: 'tco_redirect'
        })
      ]);
    } finally {
      process.env.PATH = originalPath;
      if (originalHttpsProxy === undefined) delete process.env.https_proxy;
      else process.env.https_proxy = originalHttpsProxy;
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

  it('surfaces OpenCLI stderr details when timeline fetch fails', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-x-error-provider-'));
    const originalPath = process.env.PATH;
    const fakeOpenCli = path.join(tmp, 'opencli');
    await writeFile(
      fakeOpenCli,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.join(' ') !== 'twitter timeline --type for-you --limit 20 -f json') {
  console.error('unexpected args: ' + args.join(' '));
  process.exit(64);
}
console.error('x timeline browser bridge is not ready');
process.exit(1);`,
      'utf8'
    );
    await chmod(fakeOpenCli, 0o755);
    process.env.PATH = `${tmp}${path.delimiter}${originalPath ?? ''}`;

    try {
      await expect(defaultXFeedProvider.listCandidates(normalizeXSource('x:for-you'), { limit: 20 })).rejects.toThrow(
        /stderr: x timeline browser bridge is not ready/
      );
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it('uses a configurable timeout for slow timeline fetches', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-x-timeout-provider-'));
    const originalPath = process.env.PATH;
    const fakeOpenCli = path.join(tmp, 'opencli');
    await writeFile(
      fakeOpenCli,
      `#!/usr/bin/env node
setTimeout(() => {}, 1000);`,
      'utf8'
    );
    await chmod(fakeOpenCli, 0o755);
    process.env.PATH = `${tmp}${path.delimiter}${originalPath ?? ''}`;

    try {
      await expect(defaultXFeedProvider.listCandidates(normalizeXSource('x:following'), { limit: 20, timeout_ms: 50 })).rejects.toThrow(
        /OpenCLI timed out after 50ms/
      );
    } finally {
      process.env.PATH = originalPath;
    }
  });
});
