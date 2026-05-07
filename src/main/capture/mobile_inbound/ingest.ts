import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { InboxItem } from '@shared/inbox';
import { emitActivity, type ActivityEventInput } from '../../activity';
import { createThoughtService } from '../thoughts/service';
import { copyAttachments, type CopiedAttachment } from './attachments';
import { moveToFailed, moveToProcessed } from './ack';
import type { MobileCaptureManifest, MobileFailedInfo } from './types';

export interface MobileIngestOptions {
  orbitVersion?: string;
  createThought?: (input: {
    content: string;
    tags: string[];
    actorId: string;
  }) => Promise<InboxItem>;
  emitActivity?: (input: ActivityEventInput) => unknown;
}

export interface MobileIngestResult {
  captureId: string;
  status: 'processed' | 'failed';
  inboxItemId?: string;
  targetDir: string;
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
    await verifyManifestHash(captureDir);
    const manifest = await readManifest(captureDir);
    if (manifest.schema_version !== 1) {
      throw new MobileIngestError('unsupported_schema_version', `unsupported schema ${manifest.schema_version}`, false);
    }
    const attachments = await copyAttachments(vaultPath, captureDir, manifest);
    const content = buildThoughtContent(manifest, attachments);
    const createThought =
      options.createThought ??
      ((input) =>
        createThoughtService(vaultPath).create({
          content: input.content,
          tags: input.tags,
          createdFrom: 'quick_capture',
          actor: 'user',
          actorId: input.actorId
        }));
    const inboxItem = await createThought({
      content,
      tags: manifest.tags,
      actorId: `ios:${manifest.device_id}`
    });
    const targetDir = await moveToProcessed(captureDir, {
      inbox_item_id: inboxItem.id,
      vault_path: vaultPath,
      vault_note_path: `.orbit/inbox/capture/thought/pending.ndjson`,
      orbit_version: orbitVersion
    });
    activity({
      actor: 'user',
      actor_id: `ios:${manifest.device_id}`,
      action: 'mobile_capture.ingested',
      context: { capture_id: manifest.id, inbox_item_id: inboxItem.id },
      payload: { source: manifest.source, kind: manifest.kind, attachment_count: manifest.attachments.length },
      summary: `Ingested mobile capture: ${manifest.content.slice(0, 60)}`
    });
    return { captureId, status: 'processed', inboxItemId: inboxItem.id, targetDir };
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
  let parsed: Partial<MobileCaptureManifest>;
  try {
    parsed = JSON.parse(raw) as Partial<MobileCaptureManifest>;
  } catch {
    throw new MobileIngestError('invalid_manifest', 'manifest.json is not valid JSON', false);
  }
  if (
    parsed.schema_version !== 1 ||
    parsed.source !== 'orbit-mobile-ios' ||
    typeof parsed.id !== 'string' ||
    typeof parsed.device_id !== 'string' ||
    typeof parsed.content !== 'string' ||
    !Array.isArray(parsed.tags) ||
    !Array.isArray(parsed.attachments)
  ) {
    throw new MobileIngestError('invalid_manifest', 'manifest does not match mobile schema v1', false);
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

export function buildThoughtContent(
  manifest: MobileCaptureManifest,
  attachments: CopiedAttachment[] = []
): string {
  const sections = [manifest.content.trim()];
  if (attachments.length > 0) {
    sections.push(
      [
        '---',
        '',
        ...attachments.map((attachment) => `- [${attachment.filename}](${attachment.uri})`)
      ].join('\n')
    );
  }
  return sections.filter(Boolean).join('\n\n');
}

function classifyError(error: unknown): MobileIngestError {
  if (error instanceof MobileIngestError) return error;
  if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    return new MobileIngestError('fs_error', error instanceof Error ? error.message : 'missing file', true);
  }
  return new MobileIngestError('fs_error', error instanceof Error ? error.message : String(error), true);
}
