export const ASSET_SCOPE_KINDS = ['folder', 'glob', 'file', 'url'] as const;
export type AssetScopeKind = (typeof ASSET_SCOPE_KINDS)[number];

export const ASSET_MODES = ['reference', 'imported'] as const;
export type AssetMode = (typeof ASSET_MODES)[number];

export const ASSET_AUTHORIZED_VIA = ['file-picker', 'cli-manual', 'chat-confirmed'] as const;
export type AssetAuthorizedVia = (typeof ASSET_AUTHORIZED_VIA)[number];

export interface AssetScopeStats {
  file_count: number;
  total_bytes: number;
  last_scanned_at: string;
}

export interface AssetScope {
  id: string;
  title: string;
  kind: AssetScopeKind;
  source: string;
  mode: AssetMode;
  recursive?: boolean;
  file_types?: string[];
  cached_md?: string;
  tags: string[];
  note?: string;
  authorized_by: 'user';
  authorized_via: AssetAuthorizedVia;
  authorized_at: string;
  stats?: AssetScopeStats;
}

export interface AssetPin {
  scope_id: string;
  title: string;
  source: string;
  parent_scope?: string;
  tags: string[];
  note?: string;
  pinned_by: 'user' | 'agent';
  pinned_at: string;
}

export interface AssetManifest {
  schema_version: 1;
  scopes: AssetScope[];
  pins: AssetPin[];
}

export interface AssetFileEntry {
  path: string;
  relativePath: string;
  bytes: number;
  modified_at: string;
  kind: 'file' | 'directory';
}

export interface AddAssetScopeInput {
  title?: string;
  kind: AssetScopeKind;
  source: string;
  mode?: AssetMode;
  recursive?: boolean;
  file_types?: string[];
  tags?: string[];
  note?: string;
  authorized_via: AssetAuthorizedVia;
}

export interface UpdateAssetScopeInput {
  title?: string;
  tags?: string[];
  note?: string;
  recursive?: boolean;
  file_types?: string[];
}

export interface AddAssetPinInput {
  scope_id?: string;
  title?: string;
  source: string;
  parent_scope?: string;
  tags?: string[];
  note?: string;
  pinned_by?: 'user' | 'agent';
}

export interface AssetScanOptions {
  filter?: string;
  limit?: number;
}

export interface AssetScanResult {
  scope: AssetScope;
  files: AssetFileEntry[];
  stats: AssetScopeStats;
}

export interface AssetHealthIssue {
  scope_id: string;
  title: string;
  source: string;
  reason: string;
}

export interface AssetHealthResult {
  ok: boolean;
  issues: AssetHealthIssue[];
}

