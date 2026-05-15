import type { SynthesisArtifact } from '../synthesis';

export const REVIEW_KINDS = ['daily', 'weekly', 'monthly', 'quarterly', 'area', 'resource', 'project'] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

export const REVIEW_STATUSES = ['pending', 'generating', 'generated', 'reviewed', 'actions_done', 'archived'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_SEVERITIES = ['info', 'suggestion', 'warning'] as const;
export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];

export interface ReviewRun {
  id: string;
  kind: ReviewKind;
  scope_ref?: string;
  period: { from: string; to: string };
  status: ReviewStatus;
  artifact_id?: string;
  created_at: string;
  reviewed_at?: string;
}

export interface ReviewEvidence {
  kind: string;
  description: string;
  ref?: string;
}

export type ReviewActionKind =
  | 'create_task'
  | 'archive_project'
  | 'mark_stale'
  | 'refresh_resource'
  | 'assign_area'
  | 'schedule_review'
  | 'send_reminder'
  | 'ignore';

export interface ReviewAction {
  id: string;
  kind: ReviewActionKind;
  target_ref?: string;
  description: string;
  executed: boolean;
  executed_at?: string;
}

export interface ReviewFinding {
  id: string;
  review_run_id: string;
  severity: ReviewSeverity;
  category: string;
  title: string;
  rationale: string;
  evidence?: ReviewEvidence[];
  suggested_actions: ReviewAction[];
  acknowledged?: boolean;
  resolved_at?: string;
}

export interface ReviewFilter {
  kind?: ReviewKind | 'all';
  status?: ReviewStatus | 'all';
  scope_ref?: string;
}

export interface ReviewRunDetail {
  run: ReviewRun;
  findings: ReviewFinding[];
  artifact?: SynthesisArtifact;
}

export interface ReviewHealthOverview {
  projects: { active: number; stalled: number };
  areas: { active: number; idle: number };
  resources: { active: number; dormant: number };
  library: { saved: number; read: number };
  notes: { total: number; unassigned: number };
}

export function isReviewKind(value: string): value is ReviewKind {
  return (REVIEW_KINDS as readonly string[]).includes(value);
}
