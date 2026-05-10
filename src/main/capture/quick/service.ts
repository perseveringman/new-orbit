import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  CaptureAttachment,
  CaptureAttachmentInput,
  CreateCaptureLinkInput,
  CreateCaptureLinkResult,
  CreateCaptureNoteInput,
  CreateCaptureNoteResult,
  CreateCaptureTaskInput,
  CreateCaptureTaskResult
} from '@shared/capture';
import type { SpecialMarkerKind } from '@shared/note';
import { createInboxServiceForVault } from '../../inbox';
import { createLibraryStore } from '../../library/store';
import { createNoteStore } from '../../note/store';
import { assertInsideVault, toPosix } from '../../pathGuard';
import { captureId, slugify, truncateText } from '../common';
import { createThoughtService } from '../thoughts/service';

export class QuickCaptureService {
  constructor(private readonly vaultPath: string) {}

  async saveAttachment(input: CaptureAttachmentInput): Promise<CaptureAttachment> {
    const name = safeAttachmentName(input.name);
    const data = decodeBase64(input.dataBase64);
    if (data.byteLength === 0) throw new Error('attachment data is required');
    const id = captureId(input.kind === 'audio' ? 'audio' : 'attachment');
    const day = new Date().toISOString().slice(0, 10);
    const relPath = toPosix(path.join('.orbit', 'capture', 'attachments', day, id, name));
    const absPath = assertInsideVault(this.vaultPath, path.join(this.vaultPath, relPath));
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, data);
    return {
      id,
      name,
      path: relPath,
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      kind: input.kind ?? 'file',
      size: data.byteLength
    };
  }

  async createNote(input: CreateCaptureNoteInput): Promise<CreateCaptureNoteResult> {
    const content = input.content.trim();
    const attachments = await this.saveAttachments(input.attachments ?? []);
    const audio = input.audio ? await this.saveAttachment({ ...input.audio, kind: 'audio' }) : null;
    const allAttachments = audio ? [...attachments, audio] : attachments;
    if (!content && allAttachments.length === 0) throw new Error('capture note content or attachment is required');

    const body = captureNoteBody(content, allAttachments);
    const tags = normalizeTags([...(input.tags ?? []), ...extractHashTags(content)]);
    const note = await createNoteStore(this.vaultPath).create({
      type: audio ? 'voice_log' : 'capture',
      body,
      tags,
      source: { kind: 'manual', excerpt: 'quick_capture' },
      ...(input.specialKind ? { special_marker: markerFor(input.specialKind) } : {}),
      ...(audio
        ? {
            audio: {
              path: audio.path,
              duration_sec: Math.max(0, Math.round(input.audio?.durationSec ?? 0)),
              transcribed: false
            }
          }
        : {})
    });
    const thoughtContent = content || `${audio ? 'Voice note' : 'Attachment capture'}: ${allAttachments.map((item) => item.name).join(', ')}`;
    const inboxItem = await createThoughtService(this.vaultPath).create({
      content: thoughtContent,
      tags,
      createdFrom: audio ? 'voice' : 'quick_capture',
      actor: 'user'
    });
    return { note, inboxItem, attachments: allAttachments };
  }

  async createLink(input: CreateCaptureLinkInput): Promise<CreateCaptureLinkResult> {
    const url = normalizeUrl(input.url);
    const title = input.title?.trim() || titleFromUrl(url);
    const notes = input.notes?.trim();
    const item = await createLibraryStore(this.vaultPath).save({
      kind: input.kind === 'bookmark' ? 'bookmark' : 'article',
      title,
      url,
      tags: normalizeTags(input.tags ?? []),
      body: linkBody(title, url, notes, input.kind),
      source: {
        kind: 'quick_capture',
        url,
        ...(notes ? { note: notes } : {})
      }
    });
    return { item };
  }

  async createTask(input: CreateCaptureTaskInput): Promise<CreateCaptureTaskResult> {
    const title = input.title.trim();
    if (!title) throw new Error('task title is required');
    const details = input.details?.trim() ?? '';
    const item = await createInboxServiceForVault(this.vaultPath).emitMessage({
      subtype: 'A2',
      title,
      summary: details || 'Captured task waiting for project assignment.',
      payload: {
        capture_type: 'task',
        title,
        details,
        tags: normalizeTags(input.tags ?? []),
        requested_action: 'assign_to_project'
      },
      actor: 'user'
    });
    return { item };
  }

  private async saveAttachments(inputs: CaptureAttachmentInput[]): Promise<CaptureAttachment[]> {
    const saved: CaptureAttachment[] = [];
    for (const input of inputs) {
      saved.push(await this.saveAttachment({ ...input, kind: input.kind ?? 'file' }));
    }
    return saved;
  }
}

export function createQuickCaptureService(vaultPath: string): QuickCaptureService {
  return new QuickCaptureService(vaultPath);
}

function captureNoteBody(content: string, attachments: CaptureAttachment[]): string {
  const sections = [content || 'Captured attachment.'];
  if (attachments.length > 0) {
    sections.push(
      [
        '## Attachments',
        ...attachments.map((attachment) => `- [${attachment.name}](${attachment.path})${attachment.kind === 'audio' ? ' _(voice)_' : ''}`)
      ].join('\n')
    );
  }
  return sections.join('\n\n');
}

function linkBody(title: string, url: string, notes: string | undefined, kind: CreateCaptureLinkInput['kind']): string {
  return [
    `# ${title}`,
    '',
    `Source: ${url}`,
    '',
    kind === 'read_later' ? 'Status: read later' : 'Status: bookmark',
    ...(notes ? ['', '## Notes', '', notes] : [])
  ].join('\n');
}

function decodeBase64(value: string): Buffer {
  const encoded = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  return Buffer.from(encoded, 'base64');
}

function safeAttachmentName(value: string): string {
  const base = path.basename(value.trim() || 'attachment');
  const ext = path.extname(base);
  const stem = base.slice(0, Math.max(0, base.length - ext.length));
  return `${slugify(stem)}${ext.toLowerCase() || '.bin'}`;
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean))];
}

function extractHashTags(value: string): string[] {
  return Array.from(value.matchAll(/(?:^|\s)#([a-zA-Z0-9_\-\u4e00-\u9fff]+)/g), (match) => match[1] ?? '');
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('link URL is required');
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`unsupported link protocol: ${parsed.protocol}`);
  return parsed.toString();
}

function titleFromUrl(value: string): string {
  const url = new URL(value);
  const pathTitle = url.pathname.replace(/\/$/, '').split('/').pop()?.replace(/[-_]+/g, ' ').trim();
  return truncateText(pathTitle ? `${url.hostname} - ${pathTitle}` : url.hostname, 80);
}

function markerFor(kind: string): { kind: SpecialMarkerKind; icon: string } {
  const entry = SPECIAL_MARKERS[kind];
  if (!entry) throw new Error(`unsupported special marker: ${kind}`);
  return entry;
}

const SPECIAL_MARKERS: Record<string, { kind: SpecialMarkerKind; icon: string }> = {
  insight: { kind: 'insight', icon: '💡' },
  breakthrough: { kind: 'breakthrough', icon: '🌟' },
  setback: { kind: 'setback', icon: '💔' },
  milestone: { kind: 'milestone', icon: '🏁' },
  gratitude: { kind: 'gratitude', icon: '🙏' },
  reflection: { kind: 'reflection', icon: '🪞' }
};
