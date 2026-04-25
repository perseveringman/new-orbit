import type { AutoRunnerSettings } from './schemas';

export interface AutoRunnerRunDTO {
  taskId: string;
  taskUid?: string;
  title: string;
  runId: string;
  worktreeId?: string;
  worktreePath?: string;
  startedAt: string;
}

export interface AutoRunnerStatusDTO {
  attached: boolean;
  enabled: boolean;
  settings: AutoRunnerSettings;
  running: AutoRunnerRunDTO[];
  readyTaskCount: number;
  hourlyStarted: number;
  hourlyRemaining: number;
  lastTickAt?: string;
  lastError?: string;
}
