import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { MobileCaptureAttachment, MobileCaptureManifest } from './types';

export interface CopiedAttachment {
  filename: string;
  vaultRelativePath: string;
  uri: string;
  type: MobileCaptureAttachment['type'];
  mime: string;
  byteSize: number;
  durationMs?: number;
  transcription?: string;
  derivativeKind?: string;
  schema?: string;
}

export function assertSafeRelativePath(value: string): void {
  const normalized = path.posix.normalize(value.replace(/\\/g, '/'));
  if (
    value.trim() === '' ||
    normalized === '.' ||
    normalized.startsWith('../') ||
    normalized === '..' ||
    path.isAbsolute(normalized)
  ) {
    throw new Error(`unsafe attachment path: ${value}`);
  }
}

export async function copyAttachments(
  vaultPath: string,
  captureDir: string,
  manifest: MobileCaptureManifest
): Promise<CopiedAttachment[]> {
  if (manifest.attachments.length === 0) return [];
  const targetBase = path.join(vaultPath, '.orbit', 'capture', 'attachments', manifest.id);
  await fs.mkdir(targetBase, { recursive: true });

  const copied: CopiedAttachment[] = [];
  for (const attachment of manifest.attachments) {
    assertSafeRelativePath(attachment.filename);
    const source = path.join(captureDir, attachment.filename);
    const target = path.join(targetBase, attachment.filename);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
    const vaultRelativePath = path.relative(vaultPath, target).replace(/\\/g, '/');
    copied.push({
      filename: attachment.filename,
      vaultRelativePath,
      uri: `attachment://${manifest.id}/${attachment.filename}`,
      type: attachment.type,
      mime: attachment.mime,
      byteSize: attachment.byte_size,
      durationMs: attachment.duration_ms,
      transcription: attachment.transcription,
      derivativeKind: attachment.derivative_kind,
      schema: attachment.schema
    });
  }
  return copied;
}
