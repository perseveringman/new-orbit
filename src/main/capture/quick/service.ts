import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import type {
  CaptureAttachment,
  CaptureAttachmentInput,
  CreateCaptureLinkInput,
  CreateCaptureLinkResult,
  CreateCaptureNoteInput,
  CreateCaptureNoteResult,
  CreateCaptureTaskInput,
  CreateCaptureTaskResult,
  QuickCaptureSuggestDraftInput,
  QuickCaptureSuggestDraftResult,
  QuickCaptureSuggestion
} from '@shared/capture';
import type { LibraryKind, LibrarySource } from '@shared/library';
import type { SpecialMarkerKind } from '@shared/note';
import type { RuntimeRouteDecision, SDKInvocationInput } from '@shared/runtime';
import {
  quickCaptureActionDetail,
  quickCaptureActionLabel,
  quickCaptureActionTag,
  quickCaptureSuggestionStableId
} from '@shared/quick-capture-actions';
import {
  parseContentSource,
  writeParsedContentArtifact,
  type ContentConnector,
  type FetchLike,
  type ParsedContent
} from '../../content-connectors';
import { createInboxServiceForVault } from '../../inbox';
import { createLibraryStore } from '../../library/store';
import { createNoteStore } from '../../note/store';
import { assertInsideVault, toPosix } from '../../pathGuard';
import type { SDKInvocationResult } from '../../runtime/sdk/anthropic-sdk-adapter';
import { captureId, slugify, truncateText } from '../common';

export interface QuickCaptureRuntimeRouter {
  decide(input: { mode: 'background'; modelTier?: 'fast' }): Promise<RuntimeRouteDecision>;
  stream(input: SDKInvocationInput, windows: () => BrowserWindow[]): Promise<SDKInvocationResult>;
}

export interface QuickCaptureServiceOptions {
  router?: QuickCaptureRuntimeRouter | null;
  contentConnectors?: ContentConnector[];
  fetchSource?: FetchLike;
  contentConnectorTimeoutMs?: number;
  now?: () => Date;
}

export class QuickCaptureService {
  constructor(
    private readonly vaultPath: string,
    private readonly options: QuickCaptureServiceOptions = {}
  ) {}

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

    const sourceUrl = input.sourceUrl ? normalizeUrl(input.sourceUrl) : firstUrl(content);
    const body = captureNoteBody(content, allAttachments, sourceUrl, input.acceptedSuggestionActions ?? []);
    const tags = normalizeTags([...(input.tags ?? []), ...extractHashTags(content)]);
    const note = await createNoteStore(this.vaultPath).create({
      type: audio ? 'voice_log' : 'capture',
      ...(audio ? {} : { subdir: 'quick' }),
      ...(input.sourceTitle ? { title: input.sourceTitle } : {}),
      body,
      tags,
      source: sourceUrl
        ? { kind: 'quick_capture', ref: sourceUrl, excerpt: 'url' }
        : { kind: 'quick_capture', excerpt: 'manual' },
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
    return { note, attachments: allAttachments };
  }

  async suggestDraft(input: QuickCaptureSuggestDraftInput): Promise<QuickCaptureSuggestDraftResult> {
    const heuristic = heuristicSuggestions(input);
    const sdk = await sdkFastSuggestions(input, this.options.router).catch(() => null);
    if (!sdk) return heuristic;
    return {
      title: sdk.title ?? heuristic.title,
      tags: unique([...(sdk.tags ?? []), ...heuristic.tags]).slice(0, 6),
      suggestions: mergeSuggestions(heuristic.suggestions, sdk.suggestions),
      model: sdk.model,
      source: heuristic.suggestions.length > 0 ? 'mixed' : 'sdk_fast'
    };
  }

  async createLink(input: CreateCaptureLinkInput): Promise<CreateCaptureLinkResult> {
    const url = normalizeUrl(input.url);
    const notes = input.notes?.trim();
    const parsed = await this.parseLink(url, input.title, notes);
    const artifact = await writeParsedContentArtifact(this.vaultPath, parsed, `quick-capture:${url}`);
    const title = input.title?.trim() || parsed.title || titleFromNotes(notes) || titleFromUrl(url);
    const itemUrl = parsed.canonical_url ?? parsed.source_url ?? url;
    const item = await createLibraryStore(this.vaultPath).save({
      kind: libraryKindForQuickLink(input.kind, parsed),
      title,
      url: itemUrl,
      tags: normalizeTags(input.tags ?? []),
      body: linkBody(title, itemUrl, notes, input.kind, parsed),
      source: {
        kind: 'quick_capture',
        url: parsed.source_url ?? url,
        canonical_url: parsed.canonical_url ?? itemUrl,
        provider: parsed.platform,
        source_title: input.title?.trim() || parsed.title,
        parser_hint: parsed.parser_hint,
        content_status: parsed.status === 'success' ? 'parsed' : parsed.status,
        content_connector_id: parsed.connector_id,
        content_connector_version: parsed.connector_version,
        content_error: parsed.error,
        content_fetched_at: parsed.fetched_at,
        ...librarySourceMetadataForParsed(parsed),
        language: sourceLanguageForParsed(parsed, parsed.content_markdown ?? notes ?? title),
        ...(notes ? { note: notes } : {})
      },
      ...(artifact?.path ? { source_snapshot_ref: artifact.path } : {})
    });
    return { item };
  }

  private async parseLink(url: string, title?: string, notes?: string): Promise<ParsedContent> {
    try {
      return await parseContentSource(
        {
          url,
          title,
          text: notes,
          sourceKind: 'manual'
        },
        {
          connectors: this.options.contentConnectors,
          fetch: this.options.fetchSource,
          timeoutMs: this.options.contentConnectorTimeoutMs,
          now: this.options.now
        }
      );
    } catch (error) {
      return failedQuickCaptureParsedContent(url, title, notes, error, this.options.now);
    }
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

export function createQuickCaptureService(vaultPath: string, options: QuickCaptureServiceOptions = {}): QuickCaptureService {
  return new QuickCaptureService(vaultPath, options);
}

function captureNoteBody(
  content: string,
  attachments: CaptureAttachment[],
  sourceUrl?: string,
  acceptedSuggestionActions: string[] = []
): string {
  const sections = [content || '已捕获附件。'];
  if (sourceUrl) sections.push(['## Source', '', sourceUrl].join('\n'));
  if (attachments.length > 0) {
    sections.push(
      [
        '## Attachments',
        ...attachments.map((attachment) => `- [${attachment.name}](${attachment.path})${attachment.kind === 'audio' ? ' _(voice)_' : ''}`)
      ].join('\n')
    );
  }
  if (acceptedSuggestionActions.length > 0) {
    sections.push(
      [
        '## 捕获处理',
        '',
        ...acceptedSuggestionActions.map((action) => `- ${captureActionText(action)}`)
      ].join('\n')
    );
  }
  return sections.join('\n\n');
}

function linkBody(
  title: string,
  url: string,
  notes: string | undefined,
  kind: CreateCaptureLinkInput['kind'],
  parsed: ParsedContent
): string {
  const parsedBody = parsed.status === 'success' ? parsed.content_markdown?.trim() : '';
  if (parsedBody) {
    return [
      notes ? ['## 快速捕获备注', '', notes].join('\n') : '',
      parsedBody,
      parsedBody.includes(url) ? '' : ['## Source', '', url].join('\n')
    ].filter(Boolean).join('\n\n');
  }

  return [
    `# ${title}`,
    '',
    `Source: ${url}`,
    '',
    kind === 'read_later' ? 'Status: read later' : 'Status: bookmark',
    parsed.error ? `Parse status: ${parsed.status} (${parsed.error})` : `Parse status: ${parsed.status}`,
    ...(notes ? ['', '## 快速捕获备注', '', notes] : [])
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

function firstUrl(value: string): string | undefined {
  const match = value.match(/https?:\/\/[^\s)]+|(?:^|\s)([a-z0-9.-]+\.[a-z]{2,})(?:\/[^\s)]*)?/i);
  const raw = match?.[0]?.trim() || match?.[1]?.trim();
  if (!raw) return undefined;
  try {
    return normalizeUrl(raw);
  } catch {
    return undefined;
  }
}

function titleFromUrl(value: string): string {
  const url = new URL(value);
  const pathTitle = url.pathname.replace(/\/$/, '').split('/').pop()?.replace(/[-_]+/g, ' ').trim();
  return truncateText(pathTitle ? `${url.hostname} - ${pathTitle}` : url.hostname, 80);
}

function titleFromNotes(value: string | undefined): string | undefined {
  const line = value
    ?.split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item && !/^https?:\/\//i.test(item) && !/^存下这段话[，,]/.test(item));
  return line ? truncateText(line, 80) : undefined;
}

function libraryKindForQuickLink(kind: CreateCaptureLinkInput['kind'], parsed: ParsedContent): LibraryKind {
  if (kind === 'bookmark') return 'bookmark';
  if (parsed.platform === 'youtube') return 'video';
  return 'article';
}

function librarySourceMetadataForParsed(parsed: ParsedContent): Partial<LibrarySource> {
  const metadata = parsed.metadata ?? {};
  return {
    ...(metadataString(metadata, 'external_id') ? { external_id: metadataString(metadata, 'external_id') } : {}),
    ...(metadataString(metadata, 'channel_name') ? { channel_name: metadataString(metadata, 'channel_name') } : {}),
    ...(metadataString(metadata, 'channel_id') ? { channel_id: metadataString(metadata, 'channel_id') } : {}),
    ...(metadataNumber(metadata, 'duration_seconds') !== undefined
      ? { duration_seconds: metadataNumber(metadata, 'duration_seconds') }
      : {}),
    ...(metadataString(metadata, 'published_at') ? { published_at: metadataString(metadata, 'published_at') } : {}),
    ...(metadataString(metadata, 'preferred_transcript_track_id')
      ? { preferred_transcript_track_id: metadataString(metadata, 'preferred_transcript_track_id') }
      : {})
  };
}

function sourceLanguageForParsed(parsed: ParsedContent, fallback: string): string | undefined {
  return metadataString(parsed.metadata ?? {}, 'language') ?? detectLanguage(fallback);
}

function metadataString(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function metadataNumber(metadata: Record<string, unknown>, key: string): number | undefined {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function failedQuickCaptureParsedContent(
  url: string,
  title: string | undefined,
  notes: string | undefined,
  error: unknown,
  now?: () => Date
): ParsedContent {
  return {
    platform: 'unknown',
    parser_hint: 'generic_url',
    status: 'failed',
    source_url: url,
    canonical_url: url,
    ...(title?.trim() ? { title: title.trim() } : {}),
    ...(notes?.trim() ? { excerpt: notes.trim() } : {}),
    fetched_at: (now?.() ?? new Date()).toISOString(),
    connector_id: 'none',
    connector_version: '0',
    error: error instanceof Error ? error.message : String(error)
  };
}

function detectLanguage(value: string): string | undefined {
  const sample = value.slice(0, 2000);
  if (/[\u4e00-\u9fff]/.test(sample)) return 'zh';
  if (/[a-zA-Z]/.test(sample)) return 'en';
  return undefined;
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

function heuristicSuggestions(input: QuickCaptureSuggestDraftInput): QuickCaptureSuggestDraftResult {
  const content = input.content.trim();
  const url = firstUrl(content);
  const suggestions: QuickCaptureSuggestion[] = [];
  const tags = normalizeTags(extractHashTags(content));
  if (url) {
    const parsed = new URL(url);
    suggestions.push({
      id: quickCaptureSuggestionStableId('save_to_library', { url }),
      action: 'save_to_library',
      label: quickCaptureActionLabel('save_to_library'),
      detail: parsed.hostname,
      confidence: 0.88,
      risk: 'low',
      params: { url },
      source: 'heuristic'
    });
    suggestions.push({
      id: quickCaptureSuggestionStableId('bookmark', { url }),
      action: 'bookmark',
      label: quickCaptureActionLabel('bookmark'),
      detail: quickCaptureActionDetail('bookmark'),
      confidence: 0.62,
      risk: 'low',
      params: { url },
      source: 'heuristic'
    });
  }
  if (looksActionable(content)) {
    suggestions.push({
      id: quickCaptureSuggestionStableId('create_task'),
      action: 'create_task',
      label: quickCaptureActionLabel('create_task'),
      detail: truncateText(firstLine(content), 80),
      confidence: 0.76,
      risk: 'proposal',
      params: { title: taskTitle(content), details: content },
      source: 'heuristic'
    });
  }
  if (input.hasAudio) {
    suggestions.push({
      id: quickCaptureSuggestionStableId('transcribe_voice'),
      action: 'transcribe_voice',
      label: quickCaptureActionLabel('transcribe_voice'),
      detail: quickCaptureActionDetail('transcribe_voice'),
      confidence: 0.72,
      risk: 'needs_confirm',
      source: 'heuristic'
    });
  }
  if (content.length > 800) {
    suggestions.push({
      id: quickCaptureSuggestionStableId('distill_later'),
      action: 'distill_later',
      label: quickCaptureActionLabel('distill_later'),
      detail: quickCaptureActionDetail('distill_later'),
      confidence: 0.65,
      risk: 'needs_confirm',
      source: 'heuristic'
    });
  }
  return {
    title: titleSuggestion(content, url, input.attachmentNames ?? []),
    tags,
    suggestions,
    source: 'heuristic'
  };
}

async function sdkFastSuggestions(
  input: QuickCaptureSuggestDraftInput,
  router?: QuickCaptureRuntimeRouter | null
): Promise<QuickCaptureSuggestDraftResult | null> {
  if (!router) return null;
  const content = input.content.trim();
  if (content.length < 8 && !input.hasAudio && !(input.attachmentNames?.length)) return null;
  const decision = await router.decide({ mode: 'background', modelTier: 'fast' });
  if (decision.track !== 'sdk' || !decision.endpointId) return null;
  const traceId = `quick-capture-${randomUUID()}`;
  const result = await router.stream(
    {
      endpointId: decision.endpointId,
      model: decision.model,
      modelTier: 'fast',
      system: 'You are Orbit Quick Capture. Return strict JSON only.',
      messages: [{ role: 'user', content: captureSuggestionPrompt(input) }],
      maxTokens: 512,
      temperature: 0.1,
      traceId,
      conversationId: traceId,
      mode: 'background'
    },
    () => []
  );
  const parsed = parseJsonObject(result.text);
  if (!parsed) return null;
  return {
    title: typeof parsed['title'] === 'string' ? parsed['title'].slice(0, 90) : undefined,
    tags: normalizeTags(Array.isArray(parsed['tags']) ? parsed['tags'].map(String) : []),
    suggestions: parseSdkSuggestions(parsed['suggestions']),
    model: decision.model,
    source: 'sdk_fast'
  };
}

function captureSuggestionPrompt(input: QuickCaptureSuggestDraftInput): string {
  return [
    'You are Orbit Quick Capture. Return strict JSON only.',
    'Suggest lightweight next actions for a user capture. Do not require the user to process everything.',
    'Allowed actions: save_to_library, bookmark, create_task, transcribe_voice, distill_later.',
    'Schema: {"title":"short optional title","tags":["kebab tags"],"suggestions":[{"action":"save_to_library","detail":"why","confidence":0.0,"risk":"low","params":{}}]}',
    'Risk must be one of low, needs_confirm, proposal. Use proposal for task creation.',
    `Has audio: ${Boolean(input.hasAudio)}`,
    `Attachments: ${(input.attachmentNames ?? []).join(', ') || '(none)'}`,
    'Capture:',
    input.content.slice(0, 3000)
  ].join('\n');
}

function parseSdkSuggestions(value: unknown): QuickCaptureSuggestion[] {
  if (!Array.isArray(value)) return [];
  const actions = new Set<QuickCaptureSuggestion['action']>([
    'save_to_library',
    'bookmark',
    'create_task',
    'transcribe_voice',
    'distill_later'
  ]);
  const risks = new Set<QuickCaptureSuggestion['risk']>(['low', 'needs_confirm', 'proposal']);
  return value.flatMap((item, index): QuickCaptureSuggestion[] => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const action = typeof record['action'] === 'string' && actions.has(record['action'] as QuickCaptureSuggestion['action'])
      ? (record['action'] as QuickCaptureSuggestion['action'])
      : null;
    if (!action) return [];
    const risk = typeof record['risk'] === 'string' && risks.has(record['risk'] as QuickCaptureSuggestion['risk'])
      ? (record['risk'] as QuickCaptureSuggestion['risk'])
      : action === 'create_task'
        ? 'proposal'
        : 'low';
    return [
      {
        id: `sdk:${action}:${index}`,
        action,
        label: quickCaptureActionLabel(action),
        detail: typeof record['detail'] === 'string' ? record['detail'].slice(0, 100) : undefined,
        confidence: clamp(Number(record['confidence'] ?? 0.6), 0, 1),
        risk,
        params: typeof record['params'] === 'object' && record['params'] !== null ? (record['params'] as Record<string, unknown>) : undefined,
        source: 'sdk_fast'
      }
    ];
  }).map((suggestion) => ({
    ...suggestion,
    id: quickCaptureSuggestionStableId(suggestion.action, suggestion.params)
  }));
}

function mergeSuggestions(base: QuickCaptureSuggestion[], extra: QuickCaptureSuggestion[]): QuickCaptureSuggestion[] {
  const byAction = new Map<QuickCaptureSuggestion['action'], QuickCaptureSuggestion>();
  for (const suggestion of [...base, ...extra]) {
    const existing = byAction.get(suggestion.action);
    if (!existing || suggestion.confidence >= existing.confidence || suggestion.source === 'sdk_fast') {
      byAction.set(suggestion.action, suggestion);
    }
  }
  return [...byAction.values()].slice(0, 5);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
}

function looksActionable(value: string): boolean {
  return /\b(todo|fix|ship|write|call|email|review|implement|follow up|remind|need to|should|must)\b/i.test(value)
    || /(?:^|\s)(要|需要|记得|待办|修复|实现|跟进|提醒|创建|整理)(?:\s|$)/.test(value);
}

function firstLine(value: string): string {
  return value.trim().split(/\r?\n/)[0]?.trim() ?? '';
}

function taskTitle(value: string): string {
  const line = firstLine(value).replace(/^[-*]\s*/, '').replace(/^(todo|task|待办)[:：]\s*/i, '');
  return truncateText(line || 'Captured task', 80);
}

function titleSuggestion(content: string, url: string | undefined, attachmentNames: string[]): string | undefined {
  if (content) return truncateText(firstLine(content), 80);
  if (url) return titleFromUrl(url);
  if (attachmentNames.length > 0) return `Captured ${attachmentNames.length} file${attachmentNames.length === 1 ? '' : 's'}`;
  return undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function captureActionText(action: string): string {
  if (
    action === 'save_to_library' ||
    action === 'bookmark' ||
    action === 'create_task' ||
    action === 'transcribe_voice' ||
    action === 'distill_later'
  ) {
    const tag = quickCaptureActionTag(action);
    return tag ? `${quickCaptureActionLabel(action)}（#${tag}）` : quickCaptureActionLabel(action);
  }
  return action;
}
