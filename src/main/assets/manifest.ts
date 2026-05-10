import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  ASSETS_IMPORTED_DIR,
  ASSETS_MANIFEST,
  ASSETS_REFERENCES_DIR,
  SPACE_ASSETS_DIR
} from '@shared/constants';
import type {
  AddAssetPinInput,
  AddAssetScopeInput,
  AssetManifest,
  AssetPin,
  AssetScope,
  UpdateAssetScopeInput
} from '@shared/assets';
import * as frontmatter from '../frontmatter';

const MANIFEST_BODY = `# Materials

This file is the source of truth for which assets belong to this space.
AI agents must read this manifest before accessing any local resources.
`;

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function assetsDir(spaceRoot: string): string {
  return path.join(spaceRoot, SPACE_ASSETS_DIR);
}

export function assetsManifestPath(spaceRoot: string): string {
  return path.join(assetsDir(spaceRoot), ASSETS_MANIFEST);
}

export async function ensureAssetsLayout(spaceRoot: string): Promise<void> {
  const dir = assetsDir(spaceRoot);
  await fs.mkdir(path.join(dir, ASSETS_IMPORTED_DIR), { recursive: true });
  await fs.mkdir(path.join(dir, ASSETS_REFERENCES_DIR), { recursive: true });
  const gitignore = path.join(dir, '.gitignore');
  if (!(await exists(gitignore))) {
    await fs.writeFile(gitignore, `${ASSETS_IMPORTED_DIR}/**\n!${ASSETS_IMPORTED_DIR}/.gitkeep\n`, 'utf8');
  }
  const importedKeep = path.join(dir, ASSETS_IMPORTED_DIR, '.gitkeep');
  if (!(await exists(importedKeep))) await fs.writeFile(importedKeep, '', 'utf8');
  const referencesKeep = path.join(dir, ASSETS_REFERENCES_DIR, '.gitkeep');
  if (!(await exists(referencesKeep))) await fs.writeFile(referencesKeep, '', 'utf8');
  const manifest = assetsManifestPath(spaceRoot);
  if (!(await exists(manifest))) {
    await writeAssetManifest(spaceRoot, { schema_version: 1, scopes: [], pins: [] });
  }
}

export async function readAssetManifest(spaceRoot: string): Promise<AssetManifest> {
  await ensureAssetsLayout(spaceRoot);
  const raw = await fs.readFile(assetsManifestPath(spaceRoot), 'utf8');
  const { data } = frontmatter.read(raw);
  return normalizeManifest(data);
}

export async function writeAssetManifest(spaceRoot: string, manifest: AssetManifest): Promise<void> {
  const dir = assetsDir(spaceRoot);
  await fs.mkdir(dir, { recursive: true });
  validateManifest(manifest);
  await fs.writeFile(
    assetsManifestPath(spaceRoot),
    frontmatter.write(
      {
        schema_version: 1,
        scopes: manifest.scopes,
        pins: manifest.pins
      },
      MANIFEST_BODY
    ),
    'utf8'
  );
}

export async function addAssetScope(spaceRoot: string, input: AddAssetScopeInput): Promise<AssetScope> {
  const manifest = await readAssetManifest(spaceRoot);
  const source = input.source.trim();
  if (!source) throw new Error('asset scope source is required');
  const now = new Date().toISOString();
  const scope: AssetScope = {
    id: uniqueId(manifest.scopes, slugify(input.title || path.basename(source) || input.kind)),
    title: input.title?.trim() || path.basename(source) || source,
    kind: input.kind,
    source,
    mode: input.mode ?? 'reference',
    ...(input.recursive !== undefined ? { recursive: input.recursive } : {}),
    ...(input.file_types?.length ? { file_types: normalizeTags(input.file_types) } : {}),
    tags: normalizeTags(input.tags ?? []),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    authorized_by: 'user',
    authorized_via: input.authorized_via,
    authorized_at: now
  };
  const next: AssetManifest = { ...manifest, scopes: [...manifest.scopes, scope] };
  await writeAssetManifest(spaceRoot, next);
  return scope;
}

export async function updateAssetScope(
  spaceRoot: string,
  scopeId: string,
  patch: UpdateAssetScopeInput
): Promise<AssetScope> {
  const manifest = await readAssetManifest(spaceRoot);
  const current = manifest.scopes.find((scope) => scope.id === scopeId);
  if (!current) throw new Error(`asset scope not found: ${scopeId}`);
  const nextScope: AssetScope = {
    ...current,
    ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
    ...(patch.tags !== undefined ? { tags: normalizeTags(patch.tags) } : {}),
    ...(patch.note !== undefined && patch.note.trim() ? { note: patch.note.trim() } : {}),
    ...(patch.recursive !== undefined ? { recursive: patch.recursive } : {}),
    ...(patch.file_types !== undefined ? { file_types: normalizeTags(patch.file_types) } : {})
  };
  if (patch.note !== undefined && !patch.note.trim()) delete nextScope.note;
  const next: AssetManifest = {
    ...manifest,
    scopes: manifest.scopes.map((scope) => (scope.id === scopeId ? nextScope : scope))
  };
  await writeAssetManifest(spaceRoot, next);
  return nextScope;
}

export async function removeAssetScope(spaceRoot: string, scopeId: string): Promise<AssetManifest> {
  const manifest = await readAssetManifest(spaceRoot);
  const next: AssetManifest = {
    ...manifest,
    scopes: manifest.scopes.filter((scope) => scope.id !== scopeId),
    pins: manifest.pins.filter((pin) => pin.parent_scope !== scopeId && pin.scope_id !== scopeId)
  };
  await writeAssetManifest(spaceRoot, next);
  return next;
}

export async function addAssetPin(spaceRoot: string, input: AddAssetPinInput): Promise<AssetPin> {
  const manifest = await readAssetManifest(spaceRoot);
  const source = input.source.trim();
  if (!source) throw new Error('asset pin source is required');
  if (input.parent_scope && !manifest.scopes.some((scope) => scope.id === input.parent_scope)) {
    throw new Error(`asset scope not found: ${input.parent_scope}`);
  }
  const id = uniquePinId(manifest.pins, slugify(input.scope_id || input.title || path.basename(source)));
  const now = new Date().toISOString();
  const pin: AssetPin = {
    scope_id: id,
    title: input.title?.trim() || path.basename(source) || source,
    source,
    ...(input.parent_scope ? { parent_scope: input.parent_scope } : {}),
    tags: normalizeTags(input.tags ?? []),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    pinned_by: input.pinned_by ?? 'user',
    pinned_at: now
  };
  const next: AssetManifest = { ...manifest, pins: [...manifest.pins, pin] };
  await writeAssetManifest(spaceRoot, next);
  return pin;
}

export async function removeAssetPin(spaceRoot: string, pinId: string): Promise<AssetManifest> {
  const manifest = await readAssetManifest(spaceRoot);
  const next: AssetManifest = {
    ...manifest,
    pins: manifest.pins.filter((pin) => pin.scope_id !== pinId)
  };
  await writeAssetManifest(spaceRoot, next);
  return next;
}

function normalizeManifest(data: Record<string, unknown>): AssetManifest {
  const rawScopes = Array.isArray(data['scopes']) ? data['scopes'] : [];
  const rawPins = Array.isArray(data['pins']) ? data['pins'] : [];
  const manifest: AssetManifest = {
    schema_version: 1,
    scopes: rawScopes.map(normalizeScope).filter((scope): scope is AssetScope => scope !== null),
    pins: rawPins.map(normalizePin).filter((pin): pin is AssetPin => pin !== null)
  };
  validateManifest(manifest);
  return manifest;
}

function normalizeScope(raw: unknown): AssetScope | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const id = stringValue(value['id']);
  const title = stringValue(value['title']);
  const source = stringValue(value['source']);
  const kind = stringValue(value['kind']);
  if (!id || !title || !source || !isScopeKind(kind)) return null;
  const mode = stringValue(value['mode']);
  const via = stringValue(value['authorized_via']);
  return {
    id,
    title,
    kind,
    source,
    mode: isMode(mode) ? mode : 'reference',
    ...(typeof value['recursive'] === 'boolean' ? { recursive: value['recursive'] } : {}),
    ...(Array.isArray(value['file_types']) ? { file_types: normalizeTags(value['file_types']) } : {}),
    ...(typeof value['cached_md'] === 'string' ? { cached_md: value['cached_md'] } : {}),
    tags: Array.isArray(value['tags']) ? normalizeTags(value['tags']) : [],
    ...(typeof value['note'] === 'string' ? { note: value['note'] } : {}),
    authorized_by: 'user',
    authorized_via: isAuthorizedVia(via) ? via : 'cli-manual',
    authorized_at: stringValue(value['authorized_at']) ?? new Date(0).toISOString(),
    ...(isStats(value['stats']) ? { stats: value['stats'] } : {})
  };
}

function normalizePin(raw: unknown): AssetPin | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const scopeId = stringValue(value['scope_id']);
  const title = stringValue(value['title']);
  const source = stringValue(value['source']);
  if (!scopeId || !title || !source) return null;
  return {
    scope_id: scopeId,
    title,
    source,
    ...(typeof value['parent_scope'] === 'string' ? { parent_scope: value['parent_scope'] } : {}),
    tags: Array.isArray(value['tags']) ? normalizeTags(value['tags']) : [],
    ...(typeof value['note'] === 'string' ? { note: value['note'] } : {}),
    pinned_by: value['pinned_by'] === 'agent' ? 'agent' : 'user',
    pinned_at: stringValue(value['pinned_at']) ?? new Date(0).toISOString()
  };
}

function validateManifest(manifest: AssetManifest): void {
  const scopeIds = new Set<string>();
  for (const scope of manifest.scopes) {
    if (scope.authorized_by !== 'user') throw new Error('asset scopes must be authorized by user');
    if (scopeIds.has(scope.id)) throw new Error(`duplicate asset scope id: ${scope.id}`);
    scopeIds.add(scope.id);
    if (scope.mode === 'imported') {
      const importedPrefix = `${SPACE_ASSETS_DIR}/${ASSETS_IMPORTED_DIR}/`;
      if (!scope.source.startsWith(importedPrefix)) {
        throw new Error(`imported asset scope must live under ${importedPrefix}`);
      }
    }
    if (scope.kind !== 'url' && scope.cached_md) {
      throw new Error('cached_md is only valid for url asset scopes');
    }
  }
  for (const pin of manifest.pins) {
    if (pin.parent_scope && !scopeIds.has(pin.parent_scope)) {
      throw new Error(`asset pin parent scope not found: ${pin.parent_scope}`);
    }
  }
}

function uniqueId(existing: AssetScope[], seed: string): string {
  const base = seed || `scope-${randomUUID().slice(0, 8)}`;
  let candidate = base;
  let index = 2;
  const ids = new Set(existing.map((scope) => scope.id));
  while (ids.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function uniquePinId(existing: AssetPin[], seed: string): string {
  const base = seed || `pin-${randomUUID().slice(0, 8)}`;
  let candidate = base;
  let index = 2;
  const ids = new Set(existing.map((pin) => pin.scope_id));
  while (ids.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `asset-${randomUUID().slice(0, 8)}`;
}

function normalizeTags(value: unknown[]): string[] {
  return Array.from(
    new Set(value.map((tag) => String(tag).trim()).filter((tag) => tag.length > 0))
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function isScopeKind(value: unknown): value is AssetScope['kind'] {
  return value === 'folder' || value === 'glob' || value === 'file' || value === 'url';
}

function isMode(value: unknown): value is AssetScope['mode'] {
  return value === 'reference' || value === 'imported';
}

function isAuthorizedVia(value: unknown): value is AssetScope['authorized_via'] {
  return value === 'file-picker' || value === 'cli-manual' || value === 'chat-confirmed';
}

function isStats(value: unknown): value is AssetScope['stats'] {
  if (!value || typeof value !== 'object') return false;
  const stats = value as Record<string, unknown>;
  return (
    typeof stats['file_count'] === 'number' &&
    typeof stats['total_bytes'] === 'number' &&
    typeof stats['last_scanned_at'] === 'string'
  );
}
