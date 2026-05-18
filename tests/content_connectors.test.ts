import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createBuiltinContentConnector,
  createOpenCliContentConnector,
  parseContentSource,
  type ContentConnector
} from '../src/main/content-connectors';

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
