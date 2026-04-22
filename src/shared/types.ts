export type Theme = 'light' | 'dark' | 'system';

import type { BudgetSettings } from './schemas';

export interface AppSettings {
  lastVaultPath: string | null;
  theme: Theme;
  budget: BudgetSettings;
  /** Reopen the last vault on startup. */
  reopenLastVault: boolean;
  /** User override for the `claude` binary. Empty string = auto-detect. */
  claudePath: string;
  /** ANTHROPIC_API_KEY, stored in userData settings (not the vault). */
  anthropicApiKey: string;
  /** Score threshold (0..1) for wake-up experience injection. */
  vectorWakeThreshold: number;
  /** R6: auto-generate daily review. */
  autoDailyReview?: boolean;
  /** R6: HH:MM local time for auto daily review. */
  autoDailyReviewAt?: string;
  /** R7: enable worktree GC (default on). */
  worktreeGcEnabled: boolean;
  /** R7: days before a done worktree is eligible for cleanup. */
  worktreeGcDays: number;
}

export interface DiagnosticsInfo {
  version: string;
  os: string;
  arch: string;
  electron: string;
  node: string;
  vaultPath: string | null;
  claudePath: string | null;
  claudeVersion: string | null;
  crashLogPath: string;
  userDataPath: string;
}

export interface VaultInfo {
  path: string;
  name: string;
  createdAt: string;
  orbitVersion: string;
}

export interface VaultConfig {
  version: string;
  createdAt: string;
  name: string;
}

export interface OpenVaultResult {
  ok: true;
  vault: VaultInfo;
}

export interface CancelledResult {
  ok: false;
  reason: 'cancelled' | 'invalid' | 'error';
  message?: string;
}

export type VaultResult = OpenVaultResult | CancelledResult;

export interface FileNode {
  name: string;
  path: string; // absolute
  relPath: string; // vault-relative, POSIX-style
  isDir: boolean;
  children?: FileNode[];
}

export type FsEventKind =
  | 'add'
  | 'change'
  | 'unlink'
  | 'addDir'
  | 'unlinkDir'
  | 'rename';

export interface FsEvent {
  kind: FsEventKind;
  path: string;
  relPath: string;
  oldPath?: string;
  oldRelPath?: string;
}

export interface SearchHit {
  path: string;
  relPath: string;
  title: string;
  score: number;
  snippet?: string;
}

export interface BacklinkItem {
  path: string;
  relPath: string;
  title: string;
  count: number;
}

export interface RenameResult {
  newPath: string;
  newRelPath: string;
  linksUpdated: number;
}

export interface CreateFileResult {
  path: string;
  relPath: string;
}
