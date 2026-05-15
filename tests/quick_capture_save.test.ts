import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createQuickCaptureService, createThoughtService, isQuickCaptureAccelerator, QUICK_CAPTURE_ACCELERATOR } from '../src/main/capture';
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

    const thought = await service.create({ content: 'Quick captured thought', tags: ['capture'], createdFrom: 'quick_capture', actor: 'user' });
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
    await expect(fs.readFile(path.join(vaultPath, result.attachments[0].path), 'utf8')).resolves.toBe('image-data');
    await expect(fs.readFile(path.join(vaultPath, result.attachments[1].path), 'utf8')).resolves.toBe('voice-data');
    const inboxDir = path.join(vaultPath, '.orbit', 'inbox');
    await expect(fs.stat(inboxDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('suggests lightweight actions while drafting', async () => {
    const service = createQuickCaptureService(vaultPath);
    const result = await service.suggestDraft({
      content: 'todo: review https://example.com/essay for the Orbit capture redesign'
    });

    expect(result.suggestions.map((suggestion) => suggestion.action)).toContain('save_to_library');
    expect(result.suggestions.map((suggestion) => suggestion.action)).toContain('create_task');
    expect(result.source).toBe('heuristic');
  });

  it('captures bookmarks, read-later links, and tasks into the correct stores', async () => {
    const service = createQuickCaptureService(vaultPath);
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
    expect((task.item.payload as { requested_action?: string }).requested_action).toBe('assign_to_project');
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
              label: 'Save to Library',
              confidence: 0.9,
              risk: 'low',
              source: 'heuristic'
            }
          ]
        },
        onSave: () => undefined,
        onClose: () => undefined
      })
    );

    expect(html).toContain('Type, paste, drop files, or record voice');
    expect(html).toContain('Save to Library');
    expect(html).toContain('Save Note');
    expect(html).not.toContain('Link');
    expect(html).not.toContain('Task title');
    expect(html).toContain('Attach files');
    expect(html).toContain('Record voice');
    expect(html).not.toContain('Thought-only MVP');
  });
});
