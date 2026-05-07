import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { MobileAckInfo, MobileFailedInfo } from './types';

async function moveCaptureDir(captureDir: string, bucket: 'processed' | 'failed'): Promise<string> {
  const id = path.basename(captureDir);
  const documentsDir = path.dirname(path.dirname(captureDir));
  const targetBase = path.join(documentsDir, bucket);
  const targetDir = path.join(targetBase, id);
  await fs.mkdir(targetBase, { recursive: true });
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.rename(captureDir, targetDir);
  return targetDir;
}

export async function moveToProcessed(
  captureDir: string,
  info: Omit<MobileAckInfo, 'schema_version' | 'acked_at' | 'mac_identity'>
): Promise<string> {
  const targetDir = await moveCaptureDir(captureDir, 'processed');
  const ack: MobileAckInfo = {
    schema_version: 1,
    acked_at: new Date().toISOString(),
    mac_identity: os.hostname(),
    ...info
  };
  await fs.writeFile(path.join(targetDir, '.acked'), `${JSON.stringify(ack, null, 2)}\n`, 'utf8');
  return targetDir;
}

export async function moveToFailed(
  captureDir: string,
  info: Omit<MobileFailedInfo, 'schema_version' | 'failed_at' | 'orbit_version'> & { orbit_version?: string }
): Promise<string> {
  const targetDir = await moveCaptureDir(captureDir, 'failed');
  const failed: MobileFailedInfo = {
    schema_version: 1,
    failed_at: new Date().toISOString(),
    orbit_version: info.orbit_version ?? '1.0.0',
    error_code: info.error_code,
    error_message: info.error_message,
    retryable: info.retryable
  };
  await fs.writeFile(path.join(targetDir, '.failed.json'), `${JSON.stringify(failed, null, 2)}\n`, 'utf8');
  return targetDir;
}
