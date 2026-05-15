import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { TraceableEvent } from '@shared/events';
import type {
  CreateNoteInput,
  Note,
  NoteType,
  NoteWorkbenchPayload,
  NoteWorkbenchSuggestion
} from '@shared/note';
import type { SynthesisProvenance, SynthesisSource } from '@shared/synthesis';
import { emitActivity, type ActivityEventInput } from '../../activity';
import { currentEventReplayStore, publishTraceableEvent } from '../../events/bus';
import { createNoteStore, type NoteStore } from '../../note/store';
import { noteWorkbenchEntityScope } from '../../note/workbench';
import { createSynthesisStore } from '../../synthesis/store';
import { assertSafeRelativePath, copyAttachments, type CopiedAttachment } from './attachments';
import { moveToFailed, moveToProcessed } from './ack';
import type { MobileAckInfo, MobileCaptureAttachment, MobileCaptureManifest, MobileFailedInfo } from './types';

type PublishEventInput = Parameters<typeof publishTraceableEvent>[0];

export interface MobileIngestOptions {
  orbitVersion?: string;
  createNote?: (input: CreateNoteInput) => Promise<Note>;
  publishEvent?: (input: PublishEventInput) => TraceableEvent;
  emitActivity?: (input: ActivityEventInput) => unknown;
}

export interface MobileIngestResult {
  captureId: string;
  status: 'processed' | 'failed';
  noteId?: string;
  notePath?: string;
  timelineEventId?: string;
  inboxItemId?: string;
  targetDir: string;
}

interface TranscriptSegment {
  speaker?: string;
  start_ms?: number;
  end_ms?: number;
  text?: string;
}

interface FinalTranscriptArtifact {
  schema?: string;
  language_detected?: string[];
  segments?: TranscriptSegment[];
}

interface DerivativeItem {
  title?: string;
  body?: string;
  done?: boolean;
}

interface DerivativeArtifact {
  schema?: string;
  kind?: string;
  title?: string;
  body?: string;
  items?: DerivativeItem[];
  generated_at?: string;
  provider?: string;
}

interface MobileCaptureArtifacts {
  transcript?: FinalTranscriptArtifact;
  derivatives: DerivativeArtifact[];
}

class MobileIngestError extends Error {
  constructor(
    readonly code: MobileFailedInfo['error_code'],
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
  }
}

export async function ingestCapture(
  vaultPath: string,
  captureDir: string,
  options: MobileIngestOptions = {}
): Promise<MobileIngestResult> {
  const captureId = path.basename(captureDir);
  const orbitVersion = options.orbitVersion ?? '1.0.0';
  const activity = options.emitActivity ?? emitActivity;

  try {
    await fs.access(vaultPath);
    await fs.access(path.join(captureDir, '.complete'));
    const existingAck = await readExistingProcessedAck(captureDir);
    if (existingAck) {
      await fs.rm(captureDir, { recursive: true, force: true });
      return processedResultFromAck(captureId, existingAck.targetDir, existingAck.ack);
    }

    const manifest = await readManifest(captureDir);
    await verifyManifestHash(captureDir);
    await verifyAttachmentFiles(captureDir, manifest);
    const attachments = await copyAttachments(vaultPath, captureDir, manifest);
    const artifacts = await readCaptureArtifacts(captureDir, manifest);

    const noteStore = createNoteStore(vaultPath);
    const existingNote = await findExistingMobileNote(noteStore, manifest.id);
    const note =
      existingNote ??
      (await (options.createNote ?? ((input: CreateNoteInput) => noteStore.create(input)))(
        createNoteInput(manifest, attachments, artifacts)
      ));
    await writeMobileWorkbenchArtifact(vaultPath, note, manifest, artifacts);
    const noteEvent = await publishMobileNoteCreated(note, manifest, options.publishEvent);

    const targetDir = await moveToProcessed(captureDir, {
      schema_version: 2,
      artifact_kind: 'note',
      note_id: note.frontmatter.id,
      note_path: note.path,
      timeline_event_id: noteEvent.id,
      vault_path: vaultPath,
      orbit_version: orbitVersion
    });

    activity({
      actor: 'user',
      actor_id: `ios:${manifest.device_id}`,
      action: 'mobile_capture.ingested',
      context: { capture_id: manifest.id, note_id: note.frontmatter.id, timeline_event_id: noteEvent.id },
      payload: {
        source: manifest.source,
        kind: manifest.kind,
        note_type: note.frontmatter.type,
        attachment_count: manifest.attachments.length,
        derivative_count: artifacts.derivatives.length
      },
      summary: `Ingested mobile capture as note: ${note.frontmatter.title ?? note.path}`
    });

    return {
      captureId,
      status: 'processed',
      noteId: note.frontmatter.id,
      notePath: note.path,
      timelineEventId: noteEvent.id,
      targetDir
    };
  } catch (error) {
    const classified = classifyError(error);
    const targetDir = await moveToFailed(captureDir, {
      error_code: classified.code,
      error_message: classified.message,
      retryable: classified.retryable,
      orbit_version: orbitVersion
    });
    activity({
      actor: 'system',
      action: 'mobile_capture.failed',
      context: { capture_id: captureId },
      payload: { error_code: classified.code, retryable: classified.retryable },
      summary: `Mobile capture ingest failed: ${classified.message}`
    });
    return { captureId, status: 'failed', targetDir };
  }
}

export async function readManifest(captureDir: string): Promise<MobileCaptureManifest> {
  const raw = await fs.readFile(path.join(captureDir, 'manifest.json'), 'utf8');
  let parsed: Partial<MobileCaptureManifest> & { schema_version?: number };
  try {
    parsed = JSON.parse(raw) as Partial<MobileCaptureManifest>;
  } catch {
    throw new MobileIngestError('invalid_manifest', 'manifest.json is not valid JSON', false);
  }
  if (typeof parsed.schema_version !== 'number') {
    throw new MobileIngestError('invalid_manifest', 'manifest is missing schema_version', false);
  }
  if (parsed.schema_version !== 1) {
    throw new MobileIngestError('unsupported_schema_version', `unsupported schema ${parsed.schema_version}`, false);
  }
  if (
    parsed.source !== 'orbit-mobile-ios' ||
    typeof parsed.id !== 'string' ||
    typeof parsed.device_id !== 'string' ||
    typeof parsed.kind !== 'string' ||
    !isSupportedKind(parsed.kind) ||
    typeof parsed.content !== 'string' ||
    !Array.isArray(parsed.tags) ||
    !Array.isArray(parsed.attachments)
  ) {
    throw new MobileIngestError('invalid_manifest', 'manifest does not match mobile schema v1', false);
  }
  for (const attachment of parsed.attachments) {
    validateAttachment(attachment);
  }
  return parsed as MobileCaptureManifest;
}

export async function verifyManifestHash(captureDir: string): Promise<void> {
  const manifestPath = path.join(captureDir, 'manifest.json');
  const expected = (await fs.readFile(`${manifestPath}.sha256`, 'utf8')).trim();
  const actual = createHash('sha256').update(await fs.readFile(manifestPath)).digest('hex');
  if (expected !== actual) {
    throw new MobileIngestError('sha256_mismatch', 'manifest.json.sha256 does not match manifest.json', true);
  }
}

export function buildNoteContent(
  manifest: MobileCaptureManifest,
  attachments: CopiedAttachment[] = [],
  artifacts: MobileCaptureArtifacts = { derivatives: [] }
): string {
  const sections = [formatManifestBody(manifest, artifacts.transcript)];
  const transcript = formatTranscript(artifacts.transcript);
  if (transcript) sections.push(transcript);

  const sourceAttachments = attachments
    .map(formatNoteAttachmentLink)
    .filter((line): line is string => Boolean(line));
  if (sourceAttachments.length > 0) {
    sections.push(['## Attachments', ...sourceAttachments].join('\n'));
  }

  const body = sections.filter(Boolean).join('\n\n').trim();
  return body || `Captured from Orbit Mobile on ${manifest.captured_at_local || manifest.created_at}.`;
}

export async function verifyAttachmentFiles(
  captureDir: string,
  manifest: MobileCaptureManifest
): Promise<void> {
  for (const attachment of manifest.attachments) {
    const filePath = path.join(captureDir, attachment.filename);
    const file = await fs.readFile(filePath);
    if (file.byteLength !== attachment.byte_size) {
      throw new MobileIngestError(
        'sha256_mismatch',
        `attachment byte_size mismatch: ${attachment.filename}`,
        true
      );
    }
    const actual = createHash('sha256').update(file).digest('hex');
    if (actual !== attachment.sha256) {
      throw new MobileIngestError(
        'sha256_mismatch',
        `attachment sha256 mismatch: ${attachment.filename}`,
        true
      );
    }
  }
}

async function findExistingMobileNote(store: NoteStore, captureId: string): Promise<Note | null> {
  const byStableId = await store.get(noteIdForCapture(captureId));
  if (byStableId) return byStableId;
  const notes = await store.list({ source_kind: 'mobile_capture', include_archived: true });
  return notes.find((note) => note.frontmatter.source?.ref === captureId) ?? null;
}

function createNoteInput(
  manifest: MobileCaptureManifest,
  attachments: CopiedAttachment[],
  artifacts: MobileCaptureArtifacts
): CreateNoteInput {
  const type = noteTypeForManifest(manifest);
  const audio = firstAudioAttachment(attachments, manifest);
  return {
    id: noteIdForCapture(manifest.id),
    type,
    title: titleForManifest(manifest),
    body: buildNoteContent(manifest, attachments, artifacts),
    created: manifest.created_at,
    updated: manifest.created_at,
    tags: manifest.tags,
    para_kind: 'floating',
    source: {
      kind: 'mobile_capture',
      ref: manifest.id,
      excerpt: `${manifest.kind} from ${manifest.source_version}`
    },
    ...(audio && type === 'voice_log'
      ? {
          audio: {
            path: audio.path,
            duration_sec: audio.durationSec,
            transcribed: hasUsableTranscript(artifacts.transcript)
          }
        }
      : {})
  };
}

function noteTypeForManifest(manifest: MobileCaptureManifest): NoteType {
  if (manifest.kind === 'recording' || manifest.kind === 'voice') return 'voice_log';
  if (manifest.kind === 'thought') return 'thought';
  return 'capture';
}

function firstAudioAttachment(
  attachments: CopiedAttachment[],
  manifest: MobileCaptureManifest
): { path: string; durationSec: number } | null {
  const audio = attachments.find((attachment) => attachment.type === 'audio');
  if (!audio) return null;
  const durationMs = audio.durationMs ?? manifest.recording?.duration_ms ?? 0;
  return {
    path: audio.vaultRelativePath,
    durationSec: Math.max(0, Math.round(durationMs / 1000))
  };
}

function noteIdForCapture(captureId: string): string {
  return `note-${captureId.replace(/[^A-Za-z0-9_-]/g, '-')}`;
}

function titleForManifest(manifest: MobileCaptureManifest): string {
  const firstLine = manifest.content
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find(Boolean);
  if (firstLine) return clip(firstLine, 80);
  const day = (manifest.captured_at_local || manifest.created_at).slice(0, 16).replace('T', ' ');
  if (manifest.kind === 'recording' || manifest.kind === 'voice') return `Voice capture ${day}`;
  if (manifest.kind === 'photo') return `Photo capture ${day}`;
  if (manifest.kind === 'share') return `Shared capture ${day}`;
  return `Mobile capture ${day}`;
}

async function writeMobileWorkbenchArtifact(
  vaultPath: string,
  note: Note,
  manifest: MobileCaptureManifest,
  artifacts: MobileCaptureArtifacts
): Promise<void> {
  if (artifacts.derivatives.length === 0) return;
  const payload = buildMobileWorkbenchPayload(manifest, artifacts);
  await createSynthesisStore(vaultPath).writeFresh({
    kind: 'summary.entity',
    scope_key: noteWorkbenchEntityScope(note),
    sources: [
      noteSynthesisSource(note, manifest),
      {
        kind: 'raw',
        title: 'Orbit Mobile AI derivatives',
        metadata: {
          capture_id: manifest.id,
          derivative_kinds: artifacts.derivatives.map((item) => item.kind).filter(Boolean),
          derivative_files: manifest.derivatives ?? []
        }
      }
    ],
    provenance: mobileDerivativeProvenance(artifacts),
    payload
  });
}

function buildMobileWorkbenchPayload(
  manifest: MobileCaptureManifest,
  artifacts: MobileCaptureArtifacts
): NoteWorkbenchPayload {
  const summary = artifacts.derivatives.find((item) => item.kind === 'summary');
  const summaryText =
    derivativeText(summary) ||
    artifacts.derivatives.map(derivativeText).find(Boolean) ||
    clip(manifest.content.trim(), 520) ||
    'Mobile capture AI analysis is available.';
  const keyPoints = unique(
    artifacts.derivatives
      .flatMap((derivative) => keyPointsForDerivative(derivative))
      .filter(Boolean)
  ).slice(0, 12);
  const suggestions = [
    mobileSuggestion({
      id: `mobile-ai-summary-${hashId(summaryText)}`,
      kind: 'summarize',
      title: '接受移动端 AI 摘要',
      summary: clip(summaryText, 360),
      confidence: summary ? 0.9 : 0.72,
      risk: 'low',
      target: { kind: 'summary', ref: manifest.id, title: titleForManifest(manifest) },
      evidence: summaryText ? [clip(summaryText, 280)] : undefined
    }),
    ...todoSuggestions(manifest, artifacts.derivatives.find((item) => item.kind === 'todos'))
  ];

  return {
    summary: summaryText,
    key_points: keyPoints,
    suggested_tags: manifest.tags.slice(0, 8),
    suggestions,
    relations: []
  };
}

function todoSuggestions(
  manifest: MobileCaptureManifest,
  derivative: DerivativeArtifact | undefined
): NoteWorkbenchSuggestion[] {
  const items = derivative?.items ?? [];
  return items
    .filter((item) => item.title?.trim() || item.body?.trim())
    .slice(0, 8)
    .map((item) => {
      const title = clip(item.title?.trim() || item.body?.trim() || 'Follow up', 100);
      const description = [item.title, item.body].filter(Boolean).join('\n\n');
      return mobileSuggestion({
        id: `mobile-ai-task-${hashId(`${title}:${description}`)}`,
        kind: 'propose_task',
        title: `提议任务：${title}`,
        summary: clip(description || title, 360),
        confidence: 0.76,
        risk: 'proposal',
        target: { kind: 'task', ref: title, title },
        params: {
          title,
          description: description || title,
          source_capture_id: manifest.id
        },
        evidence: [clip(description || title, 280)]
      });
    });
}

function mobileSuggestion(
  input: Omit<NoteWorkbenchSuggestion, 'status' | 'created_at'>
): NoteWorkbenchSuggestion {
  return {
    ...input,
    status: 'proposed',
    created_at: new Date().toISOString()
  };
}

function derivativeText(derivative: DerivativeArtifact | undefined): string {
  if (!derivative) return '';
  const parts = [derivative.title, derivative.body, ...(derivative.items ?? []).map(formatDerivativeItem)];
  return parts.map((part) => part?.trim()).filter(Boolean).join('\n');
}

function keyPointsForDerivative(derivative: DerivativeArtifact): string[] {
  const label = derivativeLabel(derivative.kind);
  const items = derivative.items?.map(formatDerivativeItem).filter(Boolean) ?? [];
  const lines = items.length > 0 ? items : derivative.body?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) ?? [];
  return lines.slice(0, 6).map((line) => (label ? `${label}: ${line}` : line));
}

function formatDerivativeItem(item: DerivativeItem): string {
  return [item.title, item.body].map((part) => part?.trim()).filter(Boolean).join(' - ');
}

function derivativeLabel(kind: string | undefined): string {
  if (kind === 'outline') return '大纲';
  if (kind === 'decisions') return '决策';
  if (kind === 'risks') return '风险';
  if (kind === 'todos') return '待办';
  if (kind === 'custom') return '自定义';
  return '';
}

function noteSynthesisSource(note: Note, manifest: MobileCaptureManifest): SynthesisSource {
  return {
    kind: 'note',
    ref: note.frontmatter.id,
    title: note.frontmatter.title ?? note.path,
    excerpt: clip(note.body, 1600),
    metadata: {
      path: note.path,
      mobile_capture_id: manifest.id,
      source: note.frontmatter.source,
      tags: note.frontmatter.tags
    }
  };
}

function mobileDerivativeProvenance(artifacts: MobileCaptureArtifacts): SynthesisProvenance {
  const provider = artifacts.derivatives.find((item) => item.provider)?.provider;
  const generatedAt = artifacts.derivatives.find((item) => item.generated_at)?.generated_at;
  const model = provider || 'orbit-mobile-ai-derivatives';
  return {
    runtime: provider?.toLowerCase().includes('deepseek') ? 'sdk:deepseek' : 'mobile:ai',
    model,
    prompt_version: 'orbit-mobile.derivatives.v1',
    generated_at: generatedAt ?? new Date().toISOString(),
    cost_usd: 0,
    tokens: { input: 0, output: 0 }
  };
}

async function publishMobileNoteCreated(
  note: Note,
  manifest: MobileCaptureManifest,
  publishEvent: MobileIngestOptions['publishEvent']
): Promise<TraceableEvent> {
  const eventId = `mobile-capture-note:${manifest.id}`;
  const existing = await findPersistedEvent(eventId);
  if (existing) return existing;
  const event = (publishEvent ?? publishTraceableEvent)({
    id: eventId,
    at: manifest.created_at,
    source: 'activity',
    kind: 'note.created',
    traceId: `mobile-capture:${manifest.id}`,
    spanId: `note:${note.frontmatter.id}`,
    summary: `Mobile capture created note: ${note.frontmatter.title ?? note.path}`,
    payload: {
      note_id: note.frontmatter.id,
      path: note.path,
      type: note.frontmatter.type,
      title: note.frontmatter.title
    }
  });
  await waitForPersistedEvent(event.id);
  return event;
}

async function findPersistedEvent(eventId: string): Promise<TraceableEvent | null> {
  const store = currentEventReplayStore();
  if (!store) return null;
  const result = await store.query({ type: 'note.created', limit: 5000 });
  return result.events.find((event) => event.id === eventId) ?? null;
}

async function waitForPersistedEvent(eventId: string): Promise<void> {
  if (!currentEventReplayStore()) return;
  for (let i = 0; i < 6; i += 1) {
    if (await findPersistedEvent(eventId)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function readCaptureArtifacts(
  captureDir: string,
  manifest: MobileCaptureManifest
): Promise<MobileCaptureArtifacts> {
  const transcriptAttachment = manifest.attachments.find((item) => item.type === 'transcript');
  const transcript = transcriptAttachment
    ? await readJsonAttachment<FinalTranscriptArtifact>(captureDir, transcriptAttachment)
    : undefined;
  const derivativeAttachments = manifest.attachments.filter((item) => item.type === 'derivative');
  const derivatives: DerivativeArtifact[] = [];
  for (const attachment of derivativeAttachments) {
    const parsed = await readJsonAttachment<DerivativeArtifact>(captureDir, attachment);
    if (parsed) {
      derivatives.push({
        ...parsed,
        kind: parsed.kind ?? attachment.derivative_kind
      });
    }
  }
  return { transcript, derivatives };
}

async function readJsonAttachment<T>(
  captureDir: string,
  attachment: MobileCaptureAttachment
): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(path.join(captureDir, attachment.filename), 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function validateAttachment(attachment: MobileCaptureAttachment): void {
  if (
    typeof attachment !== 'object' ||
    attachment === null ||
    !isSupportedAttachmentType(attachment.type) ||
    typeof attachment.filename !== 'string' ||
    typeof attachment.sha256 !== 'string' ||
    typeof attachment.byte_size !== 'number' ||
    typeof attachment.mime !== 'string'
  ) {
    throw new MobileIngestError('invalid_manifest', 'invalid attachment metadata', false);
  }
  try {
    assertSafeRelativePath(attachment.filename);
  } catch (error) {
    throw new MobileIngestError(
      'invalid_manifest',
      error instanceof Error ? error.message : String(error),
      false
    );
  }
}

function isSupportedKind(value: string): value is MobileCaptureManifest['kind'] {
  return ['thought', 'voice', 'photo', 'share', 'mixed', 'recording'].includes(value);
}

function isSupportedAttachmentType(value: string): value is MobileCaptureAttachment['type'] {
  return ['audio', 'image', 'file', 'transcript', 'transcript-partial', 'derivative'].includes(value);
}

function formatTranscript(transcript: FinalTranscriptArtifact | undefined): string | null {
  const segments = usableTranscriptSegments(transcript);
  if (segments.length === 0) return null;
  return [
    '## Transcript excerpt',
    '',
    ...segments.slice(0, 24).map((segment) => {
      const ts = typeof segment.start_ms === 'number' ? `${formatTimestamp(segment.start_ms)} ` : '';
      const speaker = segment.speaker ? `${segment.speaker}: ` : '';
      return `- ${ts}${speaker}${segment.text?.trim()}`;
    })
  ].join('\n');
}

function formatNoteAttachmentLink(attachment: CopiedAttachment): string | null {
  if (attachment.type === 'derivative' || attachment.type === 'transcript' || attachment.type === 'transcript-partial') {
    return null;
  }
  if (isOriginalImageSource(attachment)) return null;
  if (attachment.type === 'image') {
    return `- ![${attachment.filename}](${attachment.vaultRelativePath})`;
  }
  if (attachment.type === 'audio') {
    const duration = attachment.durationMs ? ` · ${formatDuration(attachment.durationMs)}` : '';
    return `- Recording source: [${attachment.filename}](${attachment.vaultRelativePath})${duration}`;
  }
  return `- [${attachment.filename}](${attachment.vaultRelativePath})`;
}

function isOriginalImageSource(attachment: CopiedAttachment): boolean {
  return attachment.type === 'file' && attachment.mime.startsWith('image/') && /^original-photo-\d+\./.test(attachment.filename);
}

function formatManifestBody(
  manifest: MobileCaptureManifest,
  transcript: FinalTranscriptArtifact | undefined
): string {
  const content = manifest.content.trim();
  if (manifest.kind !== 'recording') return content;

  const withoutTitle = removeLeadingDerivedTitle(content, titleForManifest(manifest));
  const transcriptLines = new Set(
    usableTranscriptSegments(transcript)
      .map((segment) => normalizeComparableText(segment.text ?? ''))
      .filter(Boolean)
  );
  const transcriptText = normalizeDenseText(
    usableTranscriptSegments(transcript)
      .map((segment) => segment.text ?? '')
      .join('')
  );
  const visibleLines = withoutTitle
    .split(/\r?\n/)
    .filter((line) => {
      const normalized = normalizeComparableText(line);
      if (!normalized) return true;
      if (isUnavailableTranscriptText(normalized)) return false;
      if (transcriptText && normalizeDenseText(normalized) === transcriptText) return false;
      return !transcriptLines.has(normalized);
    })
    .join('\n')
    .trim();

  return visibleLines;
}

function removeLeadingDerivedTitle(content: string, title: string): string {
  const lines = content.split(/\r?\n/);
  const firstContentLine = lines.findIndex((line) => line.trim());
  if (firstContentLine < 0) return '';
  const normalizedLine = normalizeComparableText(lines[firstContentLine].replace(/^#+\s*/, ''));
  if (normalizedLine !== normalizeComparableText(title)) return content;
  lines.splice(firstContentLine, 1);
  while (lines[firstContentLine]?.trim() === '') {
    lines.splice(firstContentLine, 1);
  }
  return lines.join('\n').trim();
}

function hasUsableTranscript(transcript: FinalTranscriptArtifact | undefined): boolean {
  return usableTranscriptSegments(transcript).length > 0;
}

function usableTranscriptSegments(transcript: FinalTranscriptArtifact | undefined): TranscriptSegment[] {
  return (
    transcript?.segments?.filter((segment) => {
      const text = segment.text?.trim();
      return Boolean(text && !isUnavailableTranscriptText(text));
    }) ?? []
  );
}

function isUnavailableTranscriptText(value: string): boolean {
  return /暂无可用实时转写/.test(value);
}

function normalizeComparableText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeDenseText(value: string): string {
  return value.replace(/\s+/g, '').trim();
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function processedResultFromAck(captureId: string, targetDir: string, ack: MobileAckInfo): MobileIngestResult {
  if (ack.schema_version === 2) {
    return {
      captureId,
      status: 'processed',
      noteId: ack.note_id,
      notePath: ack.note_path,
      timelineEventId: ack.timeline_event_id,
      targetDir
    };
  }
  return {
    captureId,
    status: 'processed',
    inboxItemId: ack.inbox_item_id,
    targetDir
  };
}

function classifyError(error: unknown): MobileIngestError {
  if (error instanceof MobileIngestError) return error;
  if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    return new MobileIngestError('fs_error', error instanceof Error ? error.message : 'missing file', true);
  }
  return new MobileIngestError('fs_error', error instanceof Error ? error.message : String(error), true);
}

async function readExistingProcessedAck(
  captureDir: string
): Promise<{ targetDir: string; ack: MobileAckInfo } | null> {
  const id = path.basename(captureDir);
  const documentsDir = path.dirname(path.dirname(captureDir));
  const targetDir = path.join(documentsDir, 'processed', id);
  try {
    const raw = await fs.readFile(path.join(targetDir, '.acked'), 'utf8');
    const ack = JSON.parse(raw) as MobileAckInfo;
    if (ack.schema_version === 2 && ack.artifact_kind === 'note' && typeof ack.note_id === 'string') {
      return { targetDir, ack };
    }
    if (ack.schema_version === 1 && typeof ack.inbox_item_id === 'string') {
      return { targetDir, ack };
    }
  } catch {
    return null;
  }
  return null;
}

function hashId(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 10);
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
