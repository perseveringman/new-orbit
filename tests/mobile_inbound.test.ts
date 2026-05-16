import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configureEventReplay } from '../src/main/events/bus';
import { createBuiltinContentConnector } from '../src/main/content-connectors';
import { ingestCapture } from '../src/main/capture/mobile_inbound';
import { iCloudContainerName } from '../src/main/capture/mobile_inbound/config';
import { listCompleteCaptureDirs } from '../src/main/capture/mobile_inbound/watcher';
import type { MobileCaptureManifest } from '../src/main/capture/mobile_inbound/types';
import { createLibraryStore } from '../src/main/library/store';
import { createNoteStore } from '../src/main/note/store';
import { buildNoteWorkbench } from '../src/main/note/workbench';
import { createTimelineStore } from '../src/main/timeline/store';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-mobile-inbound-'));
});

afterEach(async () => {
  configureEventReplay(null);
  await rm(tmp, { recursive: true, force: true });
});

describe('mobile inbound ingest', () => {
  it('uses the macOS Mobile Documents iCloud container folder name', () => {
    expect(iCloudContainerName()).toBe('iCloud~com~zhouyanbo~orbit~capture');
  });

  it('lists complete inbox captures for watcher reconciliation scans', async () => {
    const inbox = path.join(tmp, 'icloud', 'Documents', 'inbox');
    await mkdir(path.join(inbox, 'mob_cap_done'), { recursive: true });
    await mkdir(path.join(inbox, 'mob_cap_partial'), { recursive: true });
    await writeFile(path.join(inbox, 'mob_cap_done', '.complete'), '', 'utf8');

    await expect(listCompleteCaptureDirs(inbox)).resolves.toEqual([
      path.join(inbox, 'mob_cap_done')
    ]);
  });

  it('verifies a complete mobile capture, creates a Note, publishes timeline, and writes ack v2', async () => {
    const vault = path.join(tmp, 'vault');
    configureEventReplay(vault);
    const captureDir = await createCapture('mob_cap_ok', { content: 'A subway thought' });

    const result = await ingestCapture(vault, captureDir, {
      orbitVersion: '1.2.3',
      emitActivity: () => undefined
    });

    expect(result).toMatchObject({
      captureId: 'mob_cap_ok',
      status: 'processed',
      noteId: 'note-mob_cap_ok',
      timelineEventId: 'mobile-capture-note:mob_cap_ok'
    });

    const note = await createNoteStore(vault).get(result.noteId!);
    expect(note).toMatchObject({
      path: expect.stringContaining('notes/thoughts/'),
      frontmatter: {
        id: 'note-mob_cap_ok',
        type: 'thought',
        source: { kind: 'mobile_capture', ref: 'mob_cap_ok' }
      }
    });
    expect(note?.body).toContain('A subway thought');

    const ack = JSON.parse(await readFile(path.join(result.targetDir, '.acked'), 'utf8')) as Record<string, unknown>;
    expect(ack).toMatchObject({
      schema_version: 2,
      artifact_kind: 'note',
      note_id: 'note-mob_cap_ok',
      note_path: note?.path,
      timeline_event_id: 'mobile-capture-note:mob_cap_ok',
      vault_path: vault,
      orbit_version: '1.2.3'
    });

    const timeline = await createTimelineStore(vault).getDay('2026-05-07');
    expect(timeline.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_kind: 'note.created',
          title: 'Captured thought',
          event_id: 'mobile-capture-note:mob_cap_ok'
        })
      ])
    );
  });

  it('shows compressed photos in notes while preserving hidden original image files', async () => {
    const vault = path.join(tmp, 'vault');
    const files = {
      'photo-1.jpg': 'compressed-image-bytes',
      'original-photo-1.heic': 'original-image-bytes'
    };
    const captureDir = await createCapture(
      'mob_cap_photo',
      {
        kind: 'photo',
        content: 'Whiteboard snapshot',
        attachments: [
          attachment('image', 'photo-1.jpg', files['photo-1.jpg'], 'image/jpeg', {
            width: 1280,
            height: 960
          }),
          attachment('file', 'original-photo-1.heic', files['original-photo-1.heic'], 'image/heic')
        ]
      },
      files
    );

    const result = await ingestCapture(vault, captureDir, {
      emitActivity: () => undefined
    });

    const note = await createNoteStore(vault).get(result.noteId!);
    expect(note?.frontmatter.type).toBe('capture');
    expect(note?.body).toContain(
      '![photo-1.jpg](.orbit/capture/attachments/mob_cap_photo/photo-1.jpg)'
    );
    expect(note?.body).not.toContain('original-photo-1.heic');
    await expect(
      readFile(path.join(vault, '.orbit', 'capture', 'attachments', 'mob_cap_photo', 'original-photo-1.heic'), 'utf8')
    ).resolves.toBe(files['original-photo-1.heic']);
  });

  it('saves mobile link shares to Library and parses WeChat articles through content connectors', async () => {
    const vault = path.join(tmp, 'vault');
    const captureDir = await createCapture('mob_cap_wechat', {
      kind: 'share',
      content: '微信文章标题\n\nhttps://mp.weixin.qq.com/s/abc123',
      context: {
        share_context: {
          capture_method: 'share_extension',
          source_platform: 'wechat_article',
          parser_hint: 'wechat_article',
          source_url: 'https://mp.weixin.qq.com/s/abc123',
          canonical_url: 'https://mp.weixin.qq.com/s/abc123',
          raw_share_text: '微信文章标题',
          source_title: '微信文章标题',
          origin_app: null,
          enrichment_state: 'pending'
        }
      }
    });

    const result = await ingestCapture(vault, captureDir, {
      emitActivity: () => undefined,
      contentConnectors: [createBuiltinContentConnector()],
      fetchSource: async () => ({
        ok: true,
        status: 200,
        text: async () => `
          <html>
            <head>
              <meta property="og:title" content="Mac 解析后的微信标题">
              <meta name="description" content="这是一段微信文章摘要">
            </head>
            <body>
              <div id="js_content">
                <p>第一段正文，应该由 Mac 侧提取。</p>
                <p>第二段正文继续保留。</p>
              </div>
              <script></script>
            </body>
          </html>
        `
      })
    });

    expect(result).toMatchObject({
      status: 'processed',
      libraryItemId: 'lib-mob_cap_wechat',
      timelineEventId: 'mobile-capture-library:mob_cap_wechat'
    });
    const item = await createLibraryStore(vault).get(result.libraryItemId!);
    expect(item?.path).toContain('library/articles/');
    expect(item?.frontmatter.source).toMatchObject({
      kind: 'share',
      capture_id: 'mob_cap_wechat',
      provider: 'wechat_article',
      content_status: 'parsed',
      content_connector_id: 'builtin.web-readable'
    });
    expect(item?.body).toContain('第一段正文，应该由 Mac 侧提取。');
    expect(item?.frontmatter.source_snapshot_ref).toContain('.orbit/content/extracted/');
    const ack = JSON.parse(await readFile(path.join(result.targetDir, '.acked'), 'utf8')) as Record<string, unknown>;
    expect(ack).toMatchObject({
      schema_version: 2,
      artifact_kind: 'library_item',
      library_item_id: item?.frontmatter.id,
      library_item_path: item?.path
    });
    await expect(
      readFile(path.join(vault, item?.frontmatter.source_snapshot_ref ?? ''), 'utf8')
    ).resolves.toContain('第一段正文，应该由 Mac 侧提取。');
    expect(await createNoteStore(vault).list({ include_archived: true })).toHaveLength(0);
  });

  it('extracts WeChat article text from text_page_info when js_content is not rendered', async () => {
    const vault = path.join(tmp, 'vault');
    const captureDir = await createCapture('mob_cap_wechat_text_page', {
      kind: 'share',
      content: 'https://mp.weixin.qq.com/s/abc123',
      context: {
        share_context: {
          capture_method: 'share_extension',
          source_platform: 'wechat_article',
          parser_hint: 'wechat_article',
          source_url: 'https://mp.weixin.qq.com/s/abc123',
          canonical_url: 'https://mp.weixin.qq.com/s/abc123',
          raw_share_text: 'https://mp.weixin.qq.com/s/abc123',
          source_title: null,
          origin_app: null,
          enrichment_state: 'pending'
        }
      }
    });

    const result = await ingestCapture(vault, captureDir, {
      emitActivity: () => undefined,
      contentConnectors: [createBuiltinContentConnector()],
      fetchSource: async () => ({
        ok: true,
        status: 200,
        text: async () => `
          <html>
            <head><meta property="og:title" content="微信标题"></head>
            <body>
              <script>
                window.cgiData = {
                  text_page_info: {
                    content_noencode: '第一段\\x0a\\x0a第二段\\x22保留引号\\x22',
                  },
                  nickname: '人生算法'
                };
              </script>
            </body>
          </html>
        `
      })
    });

    const item = await createLibraryStore(vault).get(result.libraryItemId!);
    expect(item?.body).toContain('第一段');
    expect(item?.frontmatter.source).toMatchObject({ content_status: 'parsed' });
    const source = await readFile(
      path.join(vault, item?.frontmatter.source_snapshot_ref ?? ''),
      'utf8'
    );
    expect(source).toContain('第一段');
    expect(source).toContain('第二段"保留引号"');
    expect(source).not.toContain('window.cgiData');
  });

  it('routes X post shares through oEmbed parsing on Mac', async () => {
    const vault = path.join(tmp, 'vault');
    const captureDir = await createCapture('mob_cap_x', {
      kind: 'share',
      content: 'https://x.com/ryan/status/12345',
      context: {
        share_context: {
          capture_method: 'share_extension',
          source_platform: 'x',
          parser_hint: 'x_post',
          source_url: 'https://twitter.com/ryan/status/12345',
          canonical_url: 'https://x.com/ryan/status/12345',
          raw_share_text: null,
          source_title: null,
          origin_app: null,
          enrichment_state: 'pending'
        }
      }
    });

    const result = await ingestCapture(vault, captureDir, {
      emitActivity: () => undefined,
      contentConnectors: [createBuiltinContentConnector()],
      fetchSource: async (url) => {
        expect(url).toContain('publish.twitter.com/oembed');
        return {
          ok: true,
          status: 200,
          text: async () => '',
          json: async () => ({
            author_name: 'Ryan',
            html: '<blockquote>Orbit capture should preserve the original post text.</blockquote>'
          })
        };
      }
    });

    const item = await createLibraryStore(vault).get(result.libraryItemId!);
    expect(item?.frontmatter.source).toMatchObject({
      kind: 'share',
      provider: 'x',
      content_status: 'parsed',
      content_connector_id: 'builtin.web-readable'
    });
    expect(item?.body).toContain('Orbit capture should preserve the original post text.');
    await expect(
      readFile(path.join(vault, item?.frontmatter.source_snapshot_ref ?? ''), 'utf8')
    ).resolves.toContain('Orbit capture should preserve the original post text.');
  });

  it('keeps Xiaohongshu parsing best-effort and still ingests the capture', async () => {
    const vault = path.join(tmp, 'vault');
    const captureDir = await createCapture('mob_cap_xhs', {
      kind: 'share',
      content: '小红书笔记\n\nhttps://www.xiaohongshu.com/explore/abc',
      context: {
        share_context: {
          capture_method: 'share_extension',
          source_platform: 'xiaohongshu',
          parser_hint: 'xiaohongshu_note',
          source_url: 'https://www.xiaohongshu.com/explore/abc',
          canonical_url: 'https://www.xiaohongshu.com/explore/abc',
          raw_share_text: '小红书笔记',
          source_title: '小红书笔记',
          origin_app: null,
          enrichment_state: 'pending'
        }
      }
    });

    const result = await ingestCapture(vault, captureDir, {
      emitActivity: () => undefined,
      contentConnectors: [createBuiltinContentConnector()],
      fetchSource: async () => ({
        ok: false,
        status: 403,
        text: async () => ''
      })
    });

    expect(result.status).toBe('processed');
    const item = await createLibraryStore(vault).get(result.libraryItemId!);
    expect(item?.frontmatter.source).toMatchObject({
      kind: 'share',
      provider: 'xiaohongshu',
      content_status: 'failed',
      content_error: 'source_fetch_failed:403'
    });
    expect(item?.body).toContain('小红书笔记');
    expect(item?.frontmatter.source_snapshot_ref).toBeUndefined();
    expect(await createNoteStore(vault).list({ include_archived: true })).toHaveLength(0);
  });

  it('moves bad hashes to failed with retryable sha256_mismatch', async () => {
    const vault = path.join(tmp, 'vault');
    const captureDir = await createCapture('mob_cap_bad_hash', { content: 'Corrupted' });
    await writeFile(path.join(captureDir, 'manifest.json.sha256'), 'not-the-hash\n', 'utf8');

    const result = await ingestCapture(vault, captureDir, {
      emitActivity: () => undefined
    });

    expect(result.status).toBe('failed');
    await expect(stat(captureDir)).rejects.toMatchObject({ code: 'ENOENT' });
    const failure = JSON.parse(
      await readFile(path.join(result.targetDir, '.failed.json'), 'utf8')
    ) as Record<string, unknown>;
    expect(failure).toMatchObject({
      error_code: 'sha256_mismatch',
      retryable: true
    });
  });

  it('ingests recording captures as voice notes and keeps AI derivatives in Workbench only', async () => {
    const vault = path.join(tmp, 'vault');
    configureEventReplay(vault);
    const files = {
      'audio.m4a': 'audio-bytes',
      'partial-transcript.ndjson': '{"ts":"2026-05-15T00:00:00.000Z","text":"今天讨论移动同步。","isFinal":true}\n',
      'final-transcript.json': JSON.stringify({
        schema: 'orbit.transcript@1',
        segments: [
          { speaker: 'S1', start_ms: 0, end_ms: 4200, text: '今天讨论移动同步。' },
          { speaker: 'S1', start_ms: 4200, end_ms: 7600, text: 'Ryan 需要调通链路。' }
        ]
      }),
      'summary.json': JSON.stringify({
        schema: 'orbit.derivative@1',
        kind: 'summary',
        body: '这次会议确认了手机到 Mac 的 iCloud ingest 链路。',
        provider: 'deepseek-v4-flash',
        generated_at: '2026-05-15T00:00:00.000Z'
      }),
      'todos.json': JSON.stringify({
        schema: 'orbit.derivative@1',
        kind: 'todos',
        provider: 'deepseek-v4-flash',
        items: [{ title: 'Ryan', body: '调通链路', done: false }]
      })
    };
    const captureDir = await createCapture(
      'mob_cap_recording',
      {
        kind: 'recording',
        content: '产品会议\n\n今天讨论移动同步。Ryan 需要调通链路。',
        attachments: [
          attachment('audio', 'audio.m4a', files['audio.m4a'], 'audio/m4a', { duration_ms: 7600 }),
          attachment(
            'transcript-partial',
            'partial-transcript.ndjson',
            files['partial-transcript.ndjson'],
            'application/x-ndjson'
          ),
          attachment('transcript', 'final-transcript.json', files['final-transcript.json'], 'application/json'),
          attachment('derivative', 'summary.json', files['summary.json'], 'application/json', {
            derivative_kind: 'summary'
          }),
          attachment('derivative', 'todos.json', files['todos.json'], 'application/json', {
            derivative_kind: 'todos'
          })
        ],
        recording: {
          duration_ms: 7600,
          language_hints: ['zh-CN'],
          speakers: [{ id: 'S1', label: '说话人' }],
          partial_provider: 'ios-speech',
          final_provider: 'local-live-transcript',
          diarization_provider: null
        },
        derivatives: [
          { kind: 'summary', filename: 'summary.json' },
          { kind: 'todos', filename: 'todos.json' }
        ]
      },
      files
    );

    const result = await ingestCapture(vault, captureDir, {
      emitActivity: () => undefined
    });

    expect(result).toMatchObject({ status: 'processed', noteId: 'note-mob_cap_recording' });
    const note = await createNoteStore(vault).get(result.noteId!);
    expect(note?.frontmatter.type).toBe('voice_log');
    expect(note?.frontmatter.audio).toMatchObject({
      path: '.orbit/capture/attachments/mob_cap_recording/audio.m4a',
      duration_sec: 8,
      transcribed: true
    });
    expect(note?.body).toContain('## Transcript excerpt');
    expect(note?.body).toContain('00:00:00 S1: 今天讨论移动同步。');
    expect(note?.body).toContain(
      'Recording source: [audio.m4a](.orbit/capture/attachments/mob_cap_recording/audio.m4a)'
    );
    expect(note?.body).not.toContain('partial-transcript.ndjson');
    expect(note?.body).not.toContain('final-transcript.json');
    expect(note?.body).not.toContain('## AI 总结');
    expect(note?.body).not.toContain('确认了手机到 Mac 的 iCloud ingest 链路');
    expect(note?.body).not.toContain('Ryan - 调通链路');

    await expect(
      readFile(path.join(vault, '.orbit', 'capture', 'attachments', 'mob_cap_recording', 'todos.json'), 'utf8')
    ).resolves.toBe(files['todos.json']);
    await expect(
      readFile(
        path.join(vault, '.orbit', 'capture', 'attachments', 'mob_cap_recording', 'final-transcript.json'),
        'utf8'
      )
    ).resolves.toBe(files['final-transcript.json']);

    const workbench = await buildNoteWorkbench(vault, result.noteId!);
    expect(workbench.payload.summary).toContain('确认了手机到 Mac 的 iCloud ingest 链路');
    expect(workbench.payload.suggestions.map((item) => item.kind)).toEqual(
      expect.arrayContaining(['summarize', 'propose_task'])
    );
    expect(workbench.payload.suggestions.find((item) => item.kind === 'propose_task')?.summary).toContain('调通链路');
  });

  it('keeps recording transcript source files but hides unavailable placeholder transcript from note body', async () => {
    const vault = path.join(tmp, 'vault');
    configureEventReplay(vault);
    const files = {
      'audio.m4a': 'audio-bytes',
      'partial-transcript.ndjson':
        '{"ts":"2026-05-15T00:00:00.000Z","text":"语音录制 0 分 4 秒，暂无可用实时转写。","isFinal":true}\n',
      'final-transcript.json': JSON.stringify({
        schema: 'orbit.transcript@1',
        segments: [
          {
            speaker: 'S1',
            start_ms: 0,
            end_ms: 4000,
            text: '语音录制 0 分 4 秒，暂无可用实时转写。'
          }
        ]
      })
    };
    const captureDir = await createCapture(
      'mob_cap_no_transcript',
      {
        kind: 'recording',
        content: '新会议 · 现在\n\n语音录制 0 分 4 秒，暂无可用实时转写。',
        attachments: [
          attachment('audio', 'audio.m4a', files['audio.m4a'], 'audio/m4a', { duration_ms: 4000 }),
          attachment(
            'transcript-partial',
            'partial-transcript.ndjson',
            files['partial-transcript.ndjson'],
            'application/x-ndjson'
          ),
          attachment('transcript', 'final-transcript.json', files['final-transcript.json'], 'application/json')
        ],
        recording: {
          duration_ms: 4000,
          language_hints: ['zh-CN'],
          speakers: [{ id: 'S1', label: '说话人' }],
          partial_provider: 'ios-speech',
          final_provider: 'local-live-transcript',
          diarization_provider: null
        }
      },
      files
    );

    const result = await ingestCapture(vault, captureDir, {
      emitActivity: () => undefined
    });

    const note = await createNoteStore(vault).get(result.noteId!);
    expect(note?.frontmatter.audio).toMatchObject({
      path: '.orbit/capture/attachments/mob_cap_no_transcript/audio.m4a',
      duration_sec: 4,
      transcribed: false
    });
    expect(note?.body).toContain(
      'Recording source: [audio.m4a](.orbit/capture/attachments/mob_cap_no_transcript/audio.m4a)'
    );
    expect(note?.body).not.toContain('暂无可用实时转写');
    expect(note?.body).not.toContain('## Transcript excerpt');
    expect(note?.body).not.toContain('partial-transcript.ndjson');
    expect(note?.body).not.toContain('final-transcript.json');
    await expect(
      readFile(
        path.join(vault, '.orbit', 'capture', 'attachments', 'mob_cap_no_transcript', 'final-transcript.json'),
        'utf8'
      )
    ).resolves.toBe(files['final-transcript.json']);
  });

  it('moves attachment hash mismatches to failed before creating a Note', async () => {
    const vault = path.join(tmp, 'vault');
    const captureDir = await createCapture(
      'mob_cap_bad_attachment',
      {
        content: 'Photo',
        attachments: [
          {
            type: 'image',
            filename: 'photo-1.jpg',
            sha256: 'wrong',
            byte_size: 11,
            mime: 'image/jpeg'
          }
        ]
      },
      { 'photo-1.jpg': 'image-bytes' }
    );

    const result = await ingestCapture(vault, captureDir, {
      emitActivity: () => undefined
    });

    expect(result.status).toBe('failed');
    const failure = JSON.parse(
      await readFile(path.join(result.targetDir, '.failed.json'), 'utf8')
    ) as Record<string, unknown>;
    expect(failure).toMatchObject({
      error_code: 'sha256_mismatch',
      retryable: true
    });
  });

  it('rejects unsafe attachment paths as invalid manifests', async () => {
    const vault = path.join(tmp, 'vault');
    const captureDir = await createCapture(
      'mob_cap_bad_path',
      {
        content: 'Bad path',
        attachments: [
          {
            type: 'file',
            filename: '../secret.txt',
            sha256: createHash('sha256').update('secret').digest('hex'),
            byte_size: 6,
            mime: 'text/plain'
          }
        ]
      }
    );

    const result = await ingestCapture(vault, captureDir, {
      emitActivity: () => undefined
    });

    const failure = JSON.parse(
      await readFile(path.join(result.targetDir, '.failed.json'), 'utf8')
    ) as Record<string, unknown>;
    expect(failure).toMatchObject({
      error_code: 'invalid_manifest',
      retryable: false
    });
  });

  it('moves attachment byte size mismatches to retryable failed', async () => {
    const vault = path.join(tmp, 'vault');
    const captureDir = await createCapture(
      'mob_cap_bad_size',
      {
        content: 'Bad size',
        attachments: [
          {
            type: 'file',
            filename: 'note.txt',
            sha256: createHash('sha256').update('hello').digest('hex'),
            byte_size: 999,
            mime: 'text/plain'
          }
        ]
      },
      { 'note.txt': 'hello' }
    );

    const result = await ingestCapture(vault, captureDir, {
      emitActivity: () => undefined
    });

    const failure = JSON.parse(
      await readFile(path.join(result.targetDir, '.failed.json'), 'utf8')
    ) as Record<string, unknown>;
    expect(failure).toMatchObject({
      error_code: 'sha256_mismatch',
      retryable: true
    });
  });

  it('drops duplicate note copies when processed ack v2 already exists', async () => {
    const vault = path.join(tmp, 'vault');
    const captureDir = await createCapture('mob_cap_duplicate', { content: 'Already processed' });
    const processedDir = path.join(tmp, 'icloud', 'Documents', 'processed', 'mob_cap_duplicate');
    await mkdir(processedDir, { recursive: true });
    await writeFile(
      path.join(processedDir, '.acked'),
      `${JSON.stringify({
        schema_version: 2,
        acked_at: '2026-05-15T00:00:00.000Z',
        artifact_kind: 'note',
        note_id: 'note-existing',
        note_path: 'notes/thoughts/existing.md',
        timeline_event_id: 'mobile-capture-note:mob_cap_duplicate',
        vault_path: vault,
        mac_identity: 'mac',
        orbit_version: '1.0.0'
      })}\n`,
      'utf8'
    );

    const result = await ingestCapture(vault, captureDir, {
      emitActivity: () => undefined
    });

    expect(result).toMatchObject({
      status: 'processed',
      noteId: 'note-existing',
      notePath: 'notes/thoughts/existing.md',
      targetDir: processedDir
    });
    expect(await createNoteStore(vault).list({ include_archived: true })).toHaveLength(0);
    await expect(stat(captureDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('drops duplicate Library share copies when processed ack v2 already exists', async () => {
    const vault = path.join(tmp, 'vault');
    const captureDir = await createCapture('mob_cap_library_duplicate', {
      kind: 'share',
      content: 'https://mp.weixin.qq.com/s/abc123',
      context: {
        share_context: {
          capture_method: 'share_extension',
          source_platform: 'wechat_article',
          parser_hint: 'wechat_article',
          source_url: 'https://mp.weixin.qq.com/s/abc123',
          canonical_url: 'https://mp.weixin.qq.com/s/abc123',
          raw_share_text: 'https://mp.weixin.qq.com/s/abc123',
          source_title: '微信文章',
          origin_app: null,
          enrichment_state: 'pending'
        }
      }
    });
    const processedDir = path.join(tmp, 'icloud', 'Documents', 'processed', 'mob_cap_library_duplicate');
    await mkdir(processedDir, { recursive: true });
    await writeFile(
      path.join(processedDir, '.acked'),
      `${JSON.stringify({
        schema_version: 2,
        acked_at: '2026-05-15T00:00:00.000Z',
        artifact_kind: 'library_item',
        library_item_id: 'lib-existing',
        library_item_path: 'library/articles/existing.md',
        timeline_event_id: 'mobile-capture-library:mob_cap_library_duplicate',
        vault_path: vault,
        mac_identity: 'mac',
        orbit_version: '1.0.0'
      })}\n`,
      'utf8'
    );

    const result = await ingestCapture(vault, captureDir, {
      emitActivity: () => undefined
    });

    expect(result).toMatchObject({
      status: 'processed',
      libraryItemId: 'lib-existing',
      libraryItemPath: 'library/articles/existing.md',
      targetDir: processedDir
    });
    expect(await createLibraryStore(vault).list({ include_archived: true })).toHaveLength(0);
    await expect(stat(captureDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('still drops duplicate legacy Thought ack copies without re-ingesting', async () => {
    const vault = path.join(tmp, 'vault');
    const captureDir = await createCapture('mob_cap_legacy_duplicate', { content: 'Already processed' });
    const processedDir = path.join(tmp, 'icloud', 'Documents', 'processed', 'mob_cap_legacy_duplicate');
    await mkdir(processedDir, { recursive: true });
    await writeFile(
      path.join(processedDir, '.acked'),
      `${JSON.stringify({
        schema_version: 1,
        acked_at: '2026-05-15T00:00:00.000Z',
        inbox_item_id: 'thought_existing',
        vault_path: vault,
        vault_note_path: '.orbit/inbox/capture/thought/pending.ndjson',
        mac_identity: 'mac',
        orbit_version: '1.0.0'
      })}\n`,
      'utf8'
    );

    const result = await ingestCapture(vault, captureDir, {
      emitActivity: () => undefined
    });

    expect(result).toMatchObject({
      status: 'processed',
      inboxItemId: 'thought_existing',
      targetDir: processedDir
    });
    expect(await createNoteStore(vault).list({ include_archived: true })).toHaveLength(0);
    await expect(stat(captureDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

async function createCapture(
  id: string,
  overrides: Partial<MobileCaptureManifest>,
  files: Record<string, string> = {}
): Promise<string> {
  const captureDir = path.join(tmp, 'icloud', 'Documents', 'inbox', id);
  await mkdir(captureDir, { recursive: true });
  await mkdir(path.join(tmp, 'vault'), { recursive: true });
  const manifest: MobileCaptureManifest = {
    schema_version: 1,
    id,
    source: 'orbit-mobile-ios',
    source_version: '0.0.0',
    device_id: 'device-a',
    created_at: '2026-05-07T00:00:00.000Z',
    captured_at_local: '2026-05-07T08:00:00.000+08:00',
    kind: 'thought',
    content: '',
    tags: [],
    attachments: [],
    ...overrides
  };
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  for (const [filename, contents] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(captureDir, filename)), { recursive: true });
    await writeFile(path.join(captureDir, filename), contents, 'utf8');
  }
  await writeFile(path.join(captureDir, 'manifest.json'), manifestJson, 'utf8');
  await writeFile(
    path.join(captureDir, 'manifest.json.sha256'),
    `${createHash('sha256').update(manifestJson).digest('hex')}\n`,
    'utf8'
  );
  await writeFile(path.join(captureDir, '.complete'), '', 'utf8');
  return captureDir;
}

function attachment(
  type: MobileCaptureManifest['attachments'][number]['type'],
  filename: string,
  contents: string,
  mime: string,
  extra: Partial<MobileCaptureManifest['attachments'][number]> = {}
): MobileCaptureManifest['attachments'][number] {
  return {
    type,
    filename,
    sha256: createHash('sha256').update(contents).digest('hex'),
    byte_size: Buffer.byteLength(contents),
    mime,
    ...extra
  };
}
