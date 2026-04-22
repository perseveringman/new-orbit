export type WorktreeStatus = 'active' | 'merged' | 'aborted';

export interface WorktreeRecord {
  id: string;
  branch: string;
  path: string;
  createdAt: string;
  taskId?: string;
  status: WorktreeStatus;
}

export interface GitStatusSummary {
  branch: string;
  ahead: number;
  behind: number;
  clean: boolean;
  changed: string[];
  untracked: string[];
}

export interface SecretFinding {
  file: string;
  line: number;
  rule: string;
}

export interface CheckReport {
  build: {
    ok: boolean;
    exitCode: number | null;
    logTail: string;
    skipped?: boolean;
  };
  secrets: {
    ok: boolean;
    findings: SecretFinding[];
  };
  headSha?: string;
  at: string;
}

export type MergeStrategy = 'fast-forward' | 'squash';

export interface MergeResult {
  ok: boolean;
  strategy: MergeStrategy;
  mergedSha?: string;
  message?: string;
  conflicts?: string[];
}

export interface ResetAllResult {
  removed: number;
  errors: Array<{ id: string; error: string }>;
}

export interface EnvQueueStatus {
  queued: number;
  active: string | null;
}

export interface InstallResult {
  logPath: string;
}

export interface DiffFile {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  patch: string;
  binary?: boolean;
}

export interface DiffResult {
  base: string;
  head: string;
  mergeBase: string;
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
}
