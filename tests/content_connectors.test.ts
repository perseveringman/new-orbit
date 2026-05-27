import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createBuiltinContentConnector,
  createOpenCliContentConnector,
  createYouTubeContentConnector,
  parseContentSource,
  type ContentConnector
} from '../src/main/content-connectors';
import {
  defaultYouTubeFeedProvider,
  normalizeYouTubeSource,
  type YouTubeFeedProvider,
  type YouTubeVideoArchive
} from '../src/main/feed/youtube';

describe('content connectors', () => {
  it('falls back to the next connector when a higher priority connector fails', async () => {
    const failing: ContentConnector = {
      id: 'test.fail',
      version: '1',
      priority: 100,
      canHandle: () => true,
      parse: async () => ({
        platform: 'web',
        parser_hint: 'generic_url',
        status: 'failed',
        source_url: 'https://example.com/article',
        canonical_url: 'https://example.com/article',
        fetched_at: '2026-05-17T00:00:00.000Z',
        connector_id: 'test.fail',
        connector_version: '1',
        error: 'boom'
      })
    };

    const parsed = await parseContentSource(
      {
        url: 'https://example.com/article',
        title: 'Fallback article',
        sourceKind: 'library'
      },
      {
        connectors: [failing, createBuiltinContentConnector()],
        now: () => new Date('2026-05-17T00:00:00.000Z'),
        fetch: async () => ({
          ok: true,
          status: 200,
          text: async () => '<html><title>Readable</title><article><p>Connector fallback body.</p></article></html>'
        })
      }
    );

    expect(parsed.status).toBe('success');
    expect(parsed.connector_id).toBe('builtin.web-readable');
    expect(parsed.attempts?.map((attempt) => attempt.connector_id)).toEqual(['test.fail', 'builtin.web-readable']);
    expect(parsed.content_markdown).toContain('Connector fallback body.');
  });

  it('extracts WeChat text_page_info content in the builtin connector', async () => {
    const parsed = await parseContentSource(
      {
        url: 'https://mp.weixin.qq.com/s/abc123',
        platformHint: 'wechat_article',
        parserHint: 'wechat_article',
        sourceKind: 'mobile_share'
      },
      {
        connectors: [createBuiltinContentConnector()],
        now: () => new Date('2026-05-17T00:00:00.000Z'),
        fetch: async () => ({
          ok: true,
          status: 200,
          text: async () => `
            <html>
              <head><meta property="og:title" content="微信标题"></head>
              <body>
                <script>
                  window.cgiData = {
                    text_page_info: { content_noencode: '第一段\\x0a\\x0a第二段\\x22保留引号\\x22' },
                    nickname: '人生算法'
                  };
                </script>
              </body>
            </html>
          `
        })
      }
    );

    expect(parsed).toMatchObject({
      status: 'success',
      platform: 'wechat_article',
      title: '微信标题',
      author: '人生算法'
    });
    expect(parsed.content_markdown).toContain('第一段');
    expect(parsed.content_markdown).toContain('第二段"保留引号"');
  });

  it('passes WeChat URLs to OpenCLI using the current --url option shape', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-opencli-wechat-test-'));
    const originalPath = process.env.PATH;
    const fakeOpenCli = path.join(tmp, 'opencli');
    await writeFile(
      fakeOpenCli,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.join(' ') !== 'weixin download --url https://mp.weixin.qq.com/s/abc123 -f json') {
  console.error('unexpected args: ' + args.join(' '));
  process.exit(64);
}
console.log(JSON.stringify({
  title: 'OpenCLI 微信文章',
  author: 'Orbit',
  markdown: '微信正文通过 OpenCLI 抓取。'
}));`,
      'utf8'
    );
    await chmod(fakeOpenCli, 0o755);
    process.env.PATH = `${tmp}${path.delimiter}${originalPath ?? ''}`;

    try {
      const parsed = await parseContentSource(
        {
          url: 'https://mp.weixin.qq.com/s/abc123',
          platformHint: 'wechat_article',
          parserHint: 'wechat_article',
          sourceKind: 'manual'
        },
        {
          connectors: [createOpenCliContentConnector()],
          now: () => new Date('2026-05-27T00:00:00.000Z')
        }
      );

      expect(parsed).toMatchObject({
        status: 'success',
        platform: 'wechat_article',
        connector_id: 'opencli',
        title: 'OpenCLI 微信文章',
        author: 'Orbit'
      });
      expect(parsed.content_markdown).toContain('微信正文通过 OpenCLI 抓取。');
    } finally {
      process.env.PATH = originalPath;
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('does not treat Xiaohongshu media download tables as readable note content', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-opencli-xhs-test-'));
    const originalPath = process.env.PATH;
    const fakeOpenCli = path.join(tmp, 'opencli');
    await writeFile(
      fakeOpenCli,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.join(' ') === 'xiaohongshu note http://xhslink.com/o/8QW3Rwn0MFM -f json') {
  console.error('note requires full Xiaohongshu URL with xsec_token');
  process.exit(1);
}
if (args[0] === 'xiaohongshu' && args[1] === 'download') {
  console.error('download should not be used as readable content fallback');
  process.exit(65);
}
console.error('unexpected args: ' + args.join(' '));
process.exit(64);`,
      'utf8'
    );
    await chmod(fakeOpenCli, 0o755);
    process.env.PATH = `${tmp}${path.delimiter}${originalPath ?? ''}`;

    try {
      const parsed = await parseContentSource(
        {
          url: 'http://xhslink.com/o/8QW3Rwn0MFM',
          platformHint: 'xiaohongshu',
          parserHint: 'xiaohongshu_note',
          text: '黄仁勋对聪明的理解真的是一针见血',
          sourceKind: 'manual'
        },
        {
          connectors: [createOpenCliContentConnector()],
          now: () => new Date('2026-05-27T00:00:00.000Z')
        }
      );

      expect(parsed.status).toBe('failed');
      expect(parsed.error).toContain('note requires full Xiaohongshu URL');
      expect(parsed.error).not.toContain('download should not be used');
      expect(parsed.content_markdown).toBeUndefined();
    } finally {
      process.env.PATH = originalPath;
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('reuses the YouTube feed provider to parse quick-captured video links', async () => {
    const requestedVideoIds: string[] = [];
    const provider: YouTubeFeedProvider = {
      normalizeSource: normalizeYouTubeSource,
      listCandidates: async () => [],
      fetchArchive: async (videoId, options) => {
        requestedVideoIds.push(videoId);
        expect(options?.subtitleLanguages).toEqual(['zh.*', 'en.*']);
        return youtubeArchive(videoId);
      },
      buildMarkdown: defaultYouTubeFeedProvider.buildMarkdown
    };

    const parsed = await parseContentSource(
      {
        url: 'https://youtu.be/abc123?t=12',
        sourceKind: 'manual'
      },
      {
        connectors: [createYouTubeContentConnector(provider)],
        now: () => new Date('2026-05-27T00:00:00.000Z')
      }
    );

    expect(requestedVideoIds).toEqual(['abc123']);
    expect(parsed).toMatchObject({
      status: 'success',
      platform: 'youtube',
      parser_hint: 'youtube_video',
      connector_id: 'youtube.feed-provider',
      title: 'Orbit Video',
      author: 'Orbit Channel',
      canonical_url: 'https://www.youtube.com/watch?v=abc123'
    });
    expect(parsed.content_markdown).toContain('## Transcript');
    expect(parsed.content_markdown).toContain('Hello Orbit');
    expect(parsed.metadata).toMatchObject({
      provider: 'youtube',
      external_id: 'abc123',
      channel_name: 'Orbit Channel',
      duration_seconds: 120,
      has_transcript: true
    });
  });

  it('passes tweet ids to OpenCLI and formats Twitter thread JSON arrays as Markdown', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-opencli-test-'));
    const originalPath = process.env.PATH;
    const fakeOpenCli = path.join(tmp, 'opencli');
    await writeFile(
      fakeOpenCli,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.join(' ') !== 'twitter thread 2054875980536086852 -f json') {
  console.error('unexpected args: ' + args.join(' '));
  process.exit(64);
}
console.log(JSON.stringify([
  {
    id: '2054875980536086852',
    author: 'jakevin7',
    text: 'OpenCLI 一键打通 Agent 的 Twitter 世界！',
    likes: 252,
    retweets: 43,
    created_at: 'Thu May 14 10:46:26 +0000 2026',
    url: 'https://x.com/jakevin7/status/2054875980536086852'
  },
  {
    id: '2055144378193084920',
    author: 'jakevin7',
    text: '@waterfly2022 npm install &amp; update extension.',
    likes: 0,
    retweets: 0,
    created_at: 'Fri May 15 04:32:57 +0000 2026',
    url: 'https://x.com/jakevin7/status/2055144378193084920'
  }
]));`,
      'utf8'
    );
    await chmod(fakeOpenCli, 0o755);
    process.env.PATH = `${tmp}${path.delimiter}${originalPath ?? ''}`;

    try {
      const parsed = await parseContentSource(
        {
          url: 'https://x.com/jakevin7/status/2054875980536086852',
          platformHint: 'x',
          parserHint: 'x_post',
          sourceKind: 'mobile_share'
        },
        {
          connectors: [createOpenCliContentConnector()],
          now: () => new Date('2026-05-17T00:00:00.000Z')
        }
      );

      expect(parsed).toMatchObject({
        status: 'success',
        platform: 'x',
        connector_id: 'opencli',
        title: 'X post by @jakevin7',
        author: 'jakevin7'
      });
      expect(parsed.content_markdown).toContain('OpenCLI 一键打通 Agent 的 Twitter 世界！');
      expect(parsed.content_markdown).toContain('Reply by @jakevin7');
      expect(parsed.content_markdown).toContain('npm install & update extension.');
      expect(parsed.content_markdown?.trim().startsWith('[')).toBe(false);
      expect(parsed.metadata).toMatchObject({ json_shape: 'array', item_count: 2 });
    } finally {
      process.env.PATH = originalPath;
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

function youtubeArchive(videoId: string): YouTubeVideoArchive {
  return {
    info: {
      id: videoId,
      title: 'Orbit Video',
      webpage_url: `https://www.youtube.com/watch?v=${videoId}`,
      channel: 'Orbit Channel',
      channel_id: 'UCORBIT',
      description: 'Video description for quick capture.',
      duration: 120,
      timestamp: 1770000000,
      language: 'en'
    },
    subtitle_content: null,
    subtitle_format: null,
    subtitle_language: 'en',
    subtitle_tracks: [
      {
        language: 'en',
        label: 'English auto',
        source_kind: 'auto',
        file_name: `${videoId}.en.vtt`,
        content: `WEBVTT

00:00:00.000 --> 00:00:02.000
Hello Orbit
`,
        format: 'vtt',
        segments: [{ id: 'seg-00000', start_ms: 0, end_ms: 2000, text: 'Hello Orbit' }],
        transcript: '00:00:00 --> 00:00:02\nHello Orbit'
      }
    ],
    subtitle_status: 'captured',
    subtitle_requested_languages: ['zh.*', 'en.*'],
    subtitle_available_languages: [],
    automatic_caption_languages: ['en']
  };
}
