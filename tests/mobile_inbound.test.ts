import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ingestCapture } from '../src/main/capture/mobile_inbound';
import type { MobileCaptureManifest } from '../src/main/capture/mobile_inbound/types';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-mobile-inbound-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('mobile inbound ingest', () => {
  it('verifies a complete mobile capture, creates a Thought, and writes ack', async () => {
    const vault = path.join(tmp, 'vault');
    const captureDir = await createCapture('mob_cap_ok', { content: 'A subway thought' });
    const created: Array<{ content: string; tags: string[]; actorId: string }> = [];

    const result = await ingestCapture(vault, captureDir, {
      orbitVersion: '1.2.3',
      createThought: async (input) => {
        created.push(input);
        return {
          id: 'thought_123',
          category: 'capture',
          subtype: 'thought',
          title: 'A subway thought',
          summary: 'A subway thought',
          context: {},
          payload: { content: input.content, tags: input.tags, created_from: 'quick_capture' },
          status: 'pending',
          created_at: '2026-05-07T00:00:00.000Z',
          updated_at: '2026-05-07T00:00:00.000Z'
        };
      },
      emitActivity: () => undefined
    });

    expect(result).toMatchObject({
      captureId: 'mob_cap_ok',
      status: 'processed',
      inboxItemId: 'thought_123'
    });
    expect(created).toEqual([
      {
        content: 'A subway thought',
        tags: [],
        actorId: 'ios:device-a'
      }
    ]);
    const ack = JSON.parse(await readFile(path.join(result.targetDir, '.acked'), 'utf8')) as Record<string, unknown>;
    expect(ack).toMatchObject({
      schema_version: 1,
      inbox_item_id: 'thought_123',
      vault_path: vault,
      orbit_version: '1.2.3'
    });
  });

  it('moves bad hashes to failed with retryable sha256_mismatch', async () => {
    const vault = path.join(tmp, 'vault');
    const captureDir = await createCapture('mob_cap_bad_hash', { content: 'Corrupted' });
    await writeFile(path.join(captureDir, 'manifest.json.sha256'), 'not-the-hash\n', 'utf8');

    const result = await ingestCapture(vault, captureDir, {
      createThought: async () => {
        throw new Error('should not create thought');
      },
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
});

async function createCapture(
  id: string,
  overrides: Partial<MobileCaptureManifest>
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
  await writeFile(path.join(captureDir, 'manifest.json'), manifestJson, 'utf8');
  await writeFile(
    path.join(captureDir, 'manifest.json.sha256'),
    `${createHash('sha256').update(manifestJson).digest('hex')}\n`,
    'utf8'
  );
  await writeFile(path.join(captureDir, '.complete'), '', 'utf8');
  return captureDir;
}
