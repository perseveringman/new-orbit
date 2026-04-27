export type ScheduleKind = 'cron' | 'interval' | 'daily' | 'weekly' | 'monthly' | 'once';

export interface ScheduleConfig {
  kind: ScheduleKind;
  cron?: string;
  interval_minutes?: number;
  time?: string;
  day_of_week?: number[];
  day_of_month?: number;
  target_datetime?: string;
  timezone?: string;
}

export type ScheduledTaskAction =
  | { kind: 'ask_anywhere'; prompt: string; skills?: string[] }
  | { kind: 'agent_run'; agent: string; prompt: string; runtime?: string }
  | { kind: 'shell'; command: string; cwd?: string }
  | { kind: 'feed_refresh'; source_id?: string }
  | { kind: 'webhook'; url: string; method: 'GET' | 'POST'; body?: unknown };

export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;
  schedule: ScheduleConfig;
  action: ScheduledTaskAction;
  status: 'active' | 'paused' | 'disabled' | 'error';
  created_at: string;
  updated_at: string;
  next_run_at?: string;
  last_run_at?: string;
  source: 'system' | 'user' | 'ask_anywhere';
  system_key?: string;
  para_ref?: string;
  total_runs: number;
  success_runs: number;
  failure_runs: number;
  tags?: string[];
}

export interface ScheduledTaskExecution {
  id: string;
  task_id: string;
  triggered_at: string;
  started_at: string;
  completed_at?: string;
  status: 'pending' | 'running' | 'success' | 'failure' | 'timeout';
  output?: unknown;
  error?: string;
  artifacts?: Array<{ kind: 'note' | 'conversation' | 'library_item' | 'log'; ref: string }>;
  trace_id?: string;
}

export interface ScheduledTaskFilter {
  status?: ScheduledTask['status'];
  source?: ScheduledTask['source'];
}

export interface CreateScheduledTaskInput {
  name: string;
  description?: string;
  schedule: ScheduleConfig;
  action: ScheduledTaskAction;
  source?: ScheduledTask['source'];
  para_ref?: string;
  tags?: string[];
}

export interface NaturalLanguageScheduleResult {
  schedule: ScheduleConfig;
  action: ScheduledTaskAction;
  confidence: number;
}

