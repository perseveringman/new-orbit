import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createQuickCaptureService,
  createThoughtService,
  isQuickCaptureAccelerator,
  QUICK_CAPTURE_ACCELERATOR
} from '../src/main/capture';
import type { ContentConnector } from '../src/main/content-connectors';
import type { ActivityEventInput } from '../src/main/activity';
import type { ThoughtPayload } from '../src/shared/inbox';
import { QuickCaptureModal } from '../src/renderer/src/components/quick-capture/QuickCaptureModal';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = path.join(process.cwd(), 'test-results', 'quick-capture', randomUUID());
  await fs.mkdir(vaultPath, { recursive: true });
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('quick capture save', () => {
  it('uses CmdOrCtrl+Shift+I and preserves quick thought capture compatibility', async () => {
    const activities: ActivityEventInput[] = [];
    const service = createThoughtService(vaultPath, {
      now: () => new Date('2026-04-26T10:00:00.000Z'),
      emitActivity: (event) => activities.push(event)
    });

    const thought = await service.create({
      content: 'Quick captured thought',
      tags: ['capture'],
      createdFrom: 'quick_capture',
      actor: 'user'
    });
    const stored = await service.get(thought.id);

    expect(QUICK_CAPTURE_ACCELERATOR).toBe('CmdOrCtrl+Shift+I');
    expect(isQuickCaptureAccelerator('CmdOrCtrl+Shift+I')).toBe(true);
    expect(stored?.status).toBe('pending');
    expect((stored?.payload as ThoughtPayload).created_from).toBe('quick_capture');
    expect(activities.map((event) => event.action)).toEqual(['thought.created']);
  });

  it('saves memo-style notes with tags, uploaded files, and voice attachments', async () => {
    const service = createQuickCaptureService(vaultPath);
    const result = await service.createNote({
      content: 'Remember this product insight.',
      tags: ['capture', '#voice'],
      attachments: [
        {
          name: 'diagram.PNG',
          mimeType: 'image/png',
          dataBase64: Buffer.from('image-data').toString('base64')
        }
      ],
      audio: {
        name: 'voice.webm',
        mimeType: 'audio/webm',
        dataBase64: Buffer.from('voice-data').toString('base64'),
        durationSec: 7
      }
    });

    expect(result.note.frontmatter.type).toBe('voice_log');
    expect(result.note.frontmatter.tags).toEqual(['capture', 'voice']);
    expect(result.note.frontmatter.audio?.duration_sec).toBe(7);
    expect(result.note.body).toContain('## Attachments');
    expect(result.attachments).toHaveLength(2);
    await expect(
      fs.readFile(path.join(vaultPath, result.attachments[0].path), 'utf8')
    ).resolves.toBe('image-data');
    await expect(
      fs.readFile(path.join(vaultPath, result.attachments[1].path), 'utf8')
    ).resolves.toBe('voice-data');
    const inboxDir = path.join(vaultPath, '.orbit', 'inbox');
    await expect(fs.stat(inboxDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('stores markdown quick captures under the quick capture notes folder', async () => {
    const service = createQuickCaptureService(vaultPath);
    const result = await service.createNote({
      content: '• 修任务详情默认信息架构 @new-orbit #ux\n- BuJo 的关键不是纸笔，是迁移摩擦 #product',
      tags: ['capture']
    });

    expect(result.note.frontmatter.type).toBe('capture');
    expect(result.note.path).toContain('notes/captures/quick/');
    expect(result.note.frontmatter.source?.kind).toBe('quick_capture');
    expect(result.note.frontmatter.tags).toEqual(['capture', 'ux', 'product']);
    expect(result.note.body).toContain('• 修任务详情默认信息架构 @new-orbit #ux');
  });

  it('suggests lightweight actions while drafting', async () => {
    const service = createQuickCaptureService(vaultPath);
    const result = await service.suggestDraft({
      content: 'todo: review https://example.com/essay for the Orbit capture redesign'
    });

    expect(result.suggestions.map((suggestion) => suggestion.action)).toContain('save_to_library');
    expect(result.suggestions.map((suggestion) => suggestion.action)).toContain('create_task');
    expect(result.suggestions.map((suggestion) => suggestion.label)).toContain('保存到资料库');
    expect(result.suggestions.map((suggestion) => suggestion.label)).toContain('创建任务');
    expect(result.suggestions.map((suggestion) => suggestion.id)).toContain('save_to_library:https://example.com/essay');
    expect(result.suggestions.map((suggestion) => suggestion.label)).not.toContain('Save to Library');
    expect(result.source).toBe('heuristic');
  });

  it('uses the SDK fast model for AI capture suggestions when configured', async () => {
    const service = createQuickCaptureService(vaultPath, {
      router: {
        async decide(input) {
          expect(input).toEqual({ mode: 'background', modelTier: 'fast' });
          return {
            mode: 'background',
            track: 'sdk',
            runtime: 'sdk:test',
            endpointId: 'test-endpoint',
            model: 'fast-capture-model',
            reason: 'test'
          };
        },
        async stream(input) {
          expect(input.modelTier).toBe('fast');
          expect(input.mode).toBe('background');
          return {
            text: JSON.stringify({
              title: 'Timeline note idea',
              tags: ['timeline'],
              suggestions: [
                {
                  action: 'distill_later',
                  label: 'Distill later',
                  detail: 'Reusable capture signal',
                  confidence: 0.82,
                  risk: 'needs_confirm'
                }
              ]
            }),
            eventIds: [],
            inputTokens: 10,
            outputTokens: 20
          };
        }
      }
    });

    const result = await service.suggestDraft({
      content: 'Captured idea about timeline notes becoming ground truth.'
    });

    expect(result.source).toBe('sdk_fast');
    expect(result.model).toBe('fast-capture-model');
    expect(result.tags).toContain('timeline');
    expect(result.suggestions[0]?.source).toBe('sdk_fast');
  });

  it('captures bookmarks, read-later links, and tasks into the correct stores', async () => {
    const service = createQuickCaptureService(vaultPath, { contentConnectors: [] });
    const bookmark = await service.createLink({
      kind: 'bookmark',
      url: 'example.com/tool',
      title: 'Useful Tool',
      notes: 'Use this for research.',
      tags: ['tools']
    });
    const readLater = await service.createLink({
      kind: 'read_later',
      url: 'https://example.com/essay',
      tags: ['reading']
    });
    const task = await service.createTask({
      title: 'Turn capture into a project task',
      details: 'Assign it after triage.',
      tags: ['triage']
    });

    expect(bookmark.item.frontmatter.kind).toBe('bookmark');
    expect(bookmark.item.path).toContain('library/bookmarks/');
    expect(bookmark.item.frontmatter.source?.kind).toBe('quick_capture');
    expect(readLater.item.frontmatter.kind).toBe('article');
    expect(readLater.item.path).toContain('library/articles/');
    expect(task.item.category).toBe('message');
    expect(task.item.subtype).toBe('A2');
    expect(task.item.status).toBe('pending');
    expect((task.item.payload as { requested_action?: string }).requested_action).toBe(
      'assign_to_project'
    );
  });

  it('parses quick-captured links into Library snapshots with connector provenance', async () => {
    const connector: ContentConnector = {
      id: 'test.readable',
      version: '1.2.3',
      priority: 100,
      canHandle: () => true,
      parse: async (input) => ({
        platform: 'web',
        parser_hint: 'generic_url',
        status: 'success',
        source_url: input.url ?? null,
        canonical_url: 'https://example.com/essay',
        title: 'Parsed Essay',
        author: 'Orbit Author',
        excerpt: 'A parsed excerpt.',
        content_markdown: 'Parsed readable body for the Library.',
        fetched_at: '2026-05-27T00:00:00.000Z',
        connector_id: 'test.readable',
        connector_version: '1.2.3'
      })
    };
    const service = createQuickCaptureService(vaultPath, {
      contentConnectors: [connector],
      now: () => new Date('2026-05-27T00:00:00.000Z')
    });

    const result = await service.createLink({
      kind: 'read_later',
      url: 'https://example.com/essay?utm_source=test',
      notes: '从快速捕获保存，稍后提炼。',
      tags: ['reading']
    });

    expect(result.item.frontmatter.kind).toBe('article');
    expect(result.item.frontmatter.title).toBe('Parsed Essay');
    expect(result.item.frontmatter.url).toBe('https://example.com/essay');
    expect(result.item.frontmatter.source).toMatchObject({
      kind: 'quick_capture',
      provider: 'web',
      content_status: 'parsed',
      content_connector_id: 'test.readable',
      content_connector_version: '1.2.3',
      content_fetched_at: '2026-05-27T00:00:00.000Z',
      note: '从快速捕获保存，稍后提炼。'
    });
    expect(result.item.frontmatter.source_snapshot_ref).toContain('.orbit/content/extracted/');
    expect(result.item.body).toContain('## 快速捕获备注');
    expect(result.item.body).toContain('Parsed readable body for the Library.');
    await expect(
      fs.readFile(path.join(vaultPath, result.item.frontmatter.source_snapshot_ref ?? ''), 'utf8')
    ).resolves.toContain('Parsed readable body for the Library.');
  });

  it('saves quick-captured YouTube read-later links as Library videos with feed metadata', async () => {
    const connector: ContentConnector = {
      id: 'youtube.feed-provider',
      version: '1.0.0',
      priority: 100,
      canHandle: () => true,
      parse: async (input) => ({
        platform: 'youtube',
        parser_hint: 'youtube_video',
        status: 'success',
        source_url: input.url ?? null,
        canonical_url: 'https://www.youtube.com/watch?v=abc123',
        title: 'Orbit Video',
        author: 'Orbit Channel',
        excerpt: 'Video description.',
        content_markdown: '# Orbit Video\n\n## Transcript\n\n00:00:00 --> 00:00:02\nHello Orbit',
        fetched_at: '2026-05-27T00:00:00.000Z',
        connector_id: 'youtube.feed-provider',
        connector_version: '1.0.0',
        metadata: {
          provider: 'youtube',
          external_id: 'abc123',
          channel_name: 'Orbit Channel',
          channel_id: 'UCORBIT',
          duration_seconds: 95,
          published_at: '2026-05-01T00:00:00.000Z',
          language: 'en',
          preferred_transcript_track_id: 'youtube:auto:en'
        }
      })
    };
    const service = createQuickCaptureService(vaultPath, {
      contentConnectors: [connector],
      now: () => new Date('2026-05-27T00:00:00.000Z')
    });

    const result = await service.createLink({
      kind: 'read_later',
      url: 'https://youtu.be/abc123?t=12',
      notes: '稍后看这个视频。'
    });

    expect(result.item.frontmatter.kind).toBe('video');
    expect(result.item.path).toContain('library/videos/');
    expect(result.item.frontmatter.source).toMatchObject({
      kind: 'quick_capture',
      provider: 'youtube',
      external_id: 'abc123',
      channel_name: 'Orbit Channel',
      channel_id: 'UCORBIT',
      duration_seconds: 95,
      published_at: '2026-05-01T00:00:00.000Z',
      language: 'en',
      preferred_transcript_track_id: 'youtube:auto:en',
      content_status: 'parsed',
      content_connector_id: 'youtube.feed-provider'
    });
    expect(result.item.frontmatter.source_snapshot_ref).toContain('.orbit/content/extracted/');
    expect(result.item.body).toContain('## Transcript');
    expect(result.item.body).toContain('Hello Orbit');
  });

  it('keeps quick-captured links in Library when parsing fails', async () => {
    const connector: ContentConnector = {
      id: 'test.fail',
      version: '1',
      priority: 100,
      canHandle: () => true,
      parse: async (input) => ({
        platform: 'web',
        parser_hint: 'generic_url',
        status: 'failed',
        source_url: input.url ?? null,
        canonical_url: input.url ?? null,
        title: input.title ?? undefined,
        excerpt: input.text ?? undefined,
        fetched_at: '2026-05-27T00:00:00.000Z',
        connector_id: 'test.fail',
        connector_version: '1',
        error: 'source_fetch_failed:403'
      })
    };
    const service = createQuickCaptureService(vaultPath, {
      contentConnectors: [connector],
      now: () => new Date('2026-05-27T00:00:00.000Z')
    });

    const result = await service.createLink({
      kind: 'bookmark',
      url: 'https://example.com/private',
      notes: '只保存链接也不能丢。'
    });

    expect(result.item.frontmatter.kind).toBe('bookmark');
    expect(result.item.frontmatter.source).toMatchObject({
      kind: 'quick_capture',
      content_status: 'failed',
      content_connector_id: 'test.fail',
      content_error: 'source_fetch_failed:403'
    });
    expect(result.item.frontmatter.source_snapshot_ref).toBeUndefined();
    expect(result.item.body).toContain('Parse status: failed (source_fetch_failed:403)');
    expect(result.item.body).toContain('只保存链接也不能丢。');
  });

  it('keeps Xiaohongshu copied share text readable when the short link cannot be parsed', async () => {
    const copiedText = [
      '黄仁勋对聪明的理解真的是一针见血 这两天黄仁勋的一段话值得保存',
      'http://xhslink.com/o/8QW3Rwn0MFM',
      '存下这段话，去【小红书】速览笔记~'
    ].join('\n');
    const connector: ContentConnector = {
      id: 'test.xhs.fail',
      version: '1',
      priority: 100,
      canHandle: () => true,
      parse: async (input) => ({
        platform: 'xiaohongshu',
        parser_hint: 'xiaohongshu_note',
        status: 'failed',
        source_url: input.url ?? null,
        canonical_url: input.url ?? null,
        excerpt: input.text ?? undefined,
        fetched_at: '2026-05-27T00:00:00.000Z',
        connector_id: 'test.xhs.fail',
        connector_version: '1',
        error: 'note requires full Xiaohongshu URL with xsec_token'
      })
    };
    const service = createQuickCaptureService(vaultPath, {
      contentConnectors: [connector],
      now: () => new Date('2026-05-27T00:00:00.000Z')
    });

    const result = await service.createLink({
      kind: 'read_later',
      url: 'http://xhslink.com/o/8QW3Rwn0MFM',
      notes: copiedText
    });

    expect(result.item.frontmatter.title).toContain('黄仁勋对聪明的理解');
    expect(result.item.frontmatter.source).toMatchObject({
      kind: 'quick_capture',
      provider: 'xiaohongshu',
      content_status: 'failed',
      content_connector_id: 'test.xhs.fail'
    });
    expect(result.item.body).toContain('## 快速捕获备注');
    expect(result.item.body).toContain('黄仁勋对聪明的理解真的是一针见血');
    expect(result.item.body).not.toContain('| index | type | status | size |');
  });

  it('records deferred capture actions as readable note markers', async () => {
    const service = createQuickCaptureService(vaultPath);
    const result = await service.createNote({
      content: 'Long research capture',
      tags: ['research', '待提炼'],
      acceptedSuggestionActions: ['distill_later', 'transcribe_voice']
    });

    expect(result.note.frontmatter.tags).toEqual(['research', '待提炼']);
    expect(result.note.body).toContain('## 捕获处理');
    expect(result.note.body).toContain('标记稍后提炼（#待提炼）');
    expect(result.note.body).toContain('标记待转写（#待转写）');
    expect(result.note.body).not.toContain('distill_later');
  });

  it('renders a single-composer Capture modal with realtime suggestion affordances', () => {
    const html = renderToStaticMarkup(
      createElement(QuickCaptureModal, {
        open: true,
        suggestionResult: {
          source: 'heuristic',
          tags: ['capture'],
          suggestions: [
            {
              id: 'save_to_library:https://example.com',
              action: 'save_to_library',
              label: '保存到资料库',
              confidence: 0.9,
              risk: 'low',
              source: 'heuristic'
            },
            {
              id: 'bookmark:https://example.com',
              action: 'bookmark',
              label: '收藏书签',
              confidence: 0.7,
              risk: 'low',
              source: 'heuristic'
            }
          ]
        },
        onAnalyzeNow: () => undefined,
        onSave: () => undefined,
        onClose: () => undefined
      })
    );

    expect(html).toContain('输入、粘贴、拖入文件或录制语音');
    expect(html).toContain('保存到资料库');
    expect(html).toContain('收藏书签');
    expect(html).toContain('保存');
    expect(html).toContain('立即分析');
    expect(html).not.toContain('Save to Library');
    expect(html).not.toContain('Link');
    expect(html).not.toContain('Task title');
    expect(html).toContain('插入任务符号');
    expect(html).toContain('插入想法符号');
    expect(html).toContain('插入事件符号');
    expect(html).toContain('关联项目');
    expect(html).toContain('⌘1');
    expect(html).toContain('⌘K');
    expect(html).toContain('⌘Enter');
    expect(html).toContain('附件');
    expect(html).toContain('语音');
    expect(html).not.toContain('Thought-only MVP');
  });

  it('renders capture save results with follow-up destinations', () => {
    const html = renderToStaticMarkup(
      createElement(QuickCaptureModal, {
        open: true,
        saveResult: {
          note: { id: 'note-1', title: '捕获想法', path: 'notes/captures/cap.md' },
          libraryItems: [{ id: 'lib-1', title: '资料', kind: 'article' }],
          inboxItems: [{ id: 'inbox-1', title: '创建任务' }],
          markers: ['待提炼'],
          warnings: []
        },
        onSave: () => undefined,
        onClose: () => undefined
      })
    );

    expect(html).toContain('捕获已保存');
    expect(html).toContain('打开笔记');
    expect(html).toContain('查看资料库');
    expect(html).toContain('处理收件箱');
    expect(html).toContain('#待提炼');
    expect(html).toContain('继续捕获');
  });
});
