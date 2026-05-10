import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAssetStore } from '../src/main/assets/store';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-assets-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('AssetStore', () => {
  it('creates a manifest and enforces authorized file reads', async () => {
    const sourceDir = path.join(root, 'source');
    await fs.mkdir(sourceDir, { recursive: true });
    const file = path.join(sourceDir, 'note.txt');
    await fs.writeFile(file, 'authorized', 'utf8');
    const outside = path.join(root, 'outside.txt');
    await fs.writeFile(outside, 'nope', 'utf8');

    const store = createAssetStore(root);
    await store.ensureLayout();
    await store.addScope({
      title: 'Source',
      kind: 'folder',
      source: sourceDir,
      authorized_via: 'cli-manual',
      tags: ['demo']
    });

    const manifest = await store.manifest();
    expect(manifest.scopes[0]).toMatchObject({
      id: 'source',
      title: 'Source',
      authorized_by: 'user'
    });
    await expect(store.readAuthorizedFile(file)).resolves.toMatchObject({ content: 'authorized' });
    await expect(store.readAuthorizedFile(outside)).rejects.toThrow(/outside authorized scopes/);
  });

  it('scans only an authorized scope and records stats', async () => {
    const sourceDir = path.join(root, 'clips');
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'a.mp4'), 'aaa', 'utf8');
    await fs.writeFile(path.join(sourceDir, 'b.txt'), 'bbb', 'utf8');

    const store = createAssetStore(root);
    const scope = await store.addScope({
      title: 'Clips',
      kind: 'folder',
      source: sourceDir,
      authorized_via: 'cli-manual',
      tags: []
    });
    const scan = await store.scan(scope.id, { filter: '.mp4' });

    expect(scan.files.map((file) => file.relativePath)).toEqual(['a.mp4']);
    expect(scan.stats.file_count).toBe(1);
    expect((await store.manifest()).scopes[0].stats?.file_count).toBe(1);
  });
});

