import { describe, expect, it } from 'vitest';
import { createBuiltinContentConnector, parseContentSource, type ContentConnector } from '../src/main/content-connectors';

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
});
