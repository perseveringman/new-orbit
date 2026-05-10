import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  AddAssetPinInput,
  AddAssetScopeInput,
  AssetHealthResult,
  AssetManifest,
  AssetScanOptions,
  AssetScanResult,
  AssetScope,
  AssetScopeStats,
  UpdateAssetScopeInput
} from '@shared/assets';
import { assertPathAuthorized, resolveScopeSource, scopeContainsPath } from './access-control';
import {
  addAssetPin,
  addAssetScope,
  ensureAssetsLayout,
  readAssetManifest,
  removeAssetPin,
  removeAssetScope,
  updateAssetScope,
  writeAssetManifest
} from './manifest';

export class AssetStore {
  constructor(private readonly spaceRoot: string) {}

  ensureLayout(): Promise<void> {
    return ensureAssetsLayout(this.spaceRoot);
  }

  manifest(): Promise<AssetManifest> {
    return readAssetManifest(this.spaceRoot);
  }

  addScope(input: AddAssetScopeInput): Promise<AssetScope> {
    return addAssetScope(this.spaceRoot, input);
  }

  updateScope(scopeId: string, patch: UpdateAssetScopeInput): Promise<AssetScope> {
    return updateAssetScope(this.spaceRoot, scopeId, patch);
  }

  removeScope(scopeId: string): Promise<AssetManifest> {
    return removeAssetScope(this.spaceRoot, scopeId);
  }

  addPin(input: AddAssetPinInput) {
    return addAssetPin(this.spaceRoot, input);
  }

  removePin(pinId: string): Promise<AssetManifest> {
    return removeAssetPin(this.spaceRoot, pinId);
  }

  async scan(scopeId: string, options: AssetScanOptions = {}): Promise<AssetScanResult> {
    const manifest = await this.manifest();
    const scope = manifest.scopes.find((item) => item.id === scopeId);
    if (!scope) throw new Error(`asset scope not found: ${scopeId}`);
    if (scope.kind === 'url') {
      const stats = { file_count: 0, total_bytes: 0, last_scanned_at: new Date().toISOString() };
      return { scope, files: [], stats };
    }
    const files = await this.scanScope(scope, options);
    const stats: AssetScopeStats = {
      file_count: files.filter((entry) => entry.kind === 'file').length,
      total_bytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
      last_scanned_at: new Date().toISOString()
    };
    const next: AssetManifest = {
      ...manifest,
      scopes: manifest.scopes.map((item) => (item.id === scope.id ? { ...item, stats } : item))
    };
    await writeAssetManifest(this.spaceRoot, next);
    return { scope: { ...scope, stats }, files, stats };
  }

  async stat(scopeId: string): Promise<AssetScopeStats> {
    return (await this.scan(scopeId, { limit: 5_000 })).stats;
  }

  async readAuthorizedFile(targetPath: string): Promise<{ path: string; content: string }> {
    const manifest = await this.manifest();
    const abs = path.resolve(path.isAbsolute(targetPath) ? targetPath : path.join(this.spaceRoot, targetPath));
    assertPathAuthorized(this.spaceRoot, manifest, abs);
    return { path: abs, content: await fs.readFile(abs, 'utf8') };
  }

  async health(): Promise<AssetHealthResult> {
    const manifest = await this.manifest();
    const issues: AssetHealthResult['issues'] = [];
    for (const scope of manifest.scopes) {
      if (scope.kind === 'url') continue;
      const abs = resolveScopeSource(this.spaceRoot, scope.source);
      try {
        await fs.access(abs);
      } catch {
        issues.push({
          scope_id: scope.id,
          title: scope.title,
          source: scope.source,
          reason: 'not_found'
        });
      }
    }
    return { ok: issues.length === 0, issues };
  }

  private async scanScope(scope: AssetScope, options: AssetScanOptions) {
    const limit = options.limit ?? 200;
    if (limit <= 0) throw new Error('asset scan limit must be positive');
    const root = resolveScopeSource(this.spaceRoot, scope.source);
    const results: AssetScanResult['files'] = [];
    const filter = options.filter?.trim();
    const include = (abs: string): boolean =>
      (!filter || path.basename(abs).includes(filter) || abs.includes(filter)) &&
      scopeContainsPath(this.spaceRoot, scope, abs);

    const push = async (abs: string): Promise<void> => {
      if (results.length >= limit || !include(abs)) return;
      const stat = await fs.stat(abs);
      results.push({
        path: abs,
        relativePath: path.relative(root, abs) || path.basename(abs),
        bytes: stat.isFile() ? stat.size : 0,
        modified_at: stat.mtime.toISOString(),
        kind: stat.isDirectory() ? 'directory' : 'file'
      });
    };

    const walk = async (dir: string): Promise<void> => {
      if (results.length >= limit) return;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= limit) return;
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (scope.recursive !== false) await walk(abs);
        } else if (entry.isFile()) {
          await push(abs);
        }
      }
    };

    if (scope.kind === 'file') {
      await push(root);
    } else if (scope.kind === 'folder' || scope.kind === 'glob') {
      await walk(root);
    }
    return results;
  }
}

export function createAssetStore(spaceRoot: string): AssetStore {
  return new AssetStore(spaceRoot);
}

