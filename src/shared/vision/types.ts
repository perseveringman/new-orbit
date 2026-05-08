export const VISION_HORIZONS = ['life', '5y', '1y', 'quarter'] as const;
export type VisionHorizon = (typeof VISION_HORIZONS)[number];

export type VisionGoalStatus = 'active' | 'paused' | 'completed' | 'dropped';

export interface VisionGoal {
  id: string;
  title: string;
  horizon: VisionHorizon;
  description: string;
  area_refs: string[];
  target_outcome?: string;
  status: VisionGoalStatus;
  priority: number;
  parent_goal_id?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface VisionMilestone {
  id: string;
  goal_id: string;
  title: string;
  target_date?: string;
  project_refs?: string[];
  completed_at?: string;
  notes?: string;
}

export interface VisionReviewFinding {
  goal_id?: string;
  severity: 'info' | 'warning';
  title: string;
  rationale: string;
}

export interface VisionReview {
  id: string;
  reviewed_at: string;
  period: 'quarterly' | 'annual';
  findings: VisionReviewFinding[];
  goal_changes: string[];
  artifact_id?: string;
}

export interface VisionDriftWarning {
  goal_id: string;
  area_slug: string;
  drift_type: 'neglect' | 'overgrowth' | 'inactivity';
  severity: 'low' | 'medium' | 'high';
  rationale: string;
  suggested_action: string;
}

export interface VisionAlignmentMap {
  goal_id: string;
  alignment_score: number;
  evidence: {
    active_projects: number;
    completed_projects: number;
    resources_touched: number;
    notes_count: number;
    time_spent_hours: number;
  };
}

export interface CreateGoalInput {
  title: string;
  horizon: VisionHorizon;
  description?: string;
  area_refs?: string[];
  target_outcome?: string;
  priority?: number;
  parent_goal_id?: string;
  milestones?: Array<Omit<CreateMilestoneInput, 'goal_id'>>;
}

export interface UpdateGoalInput {
  title?: string;
  horizon?: VisionHorizon;
  description?: string;
  area_refs?: string[];
  target_outcome?: string;
  status?: VisionGoalStatus;
  priority?: number;
  parent_goal_id?: string;
}

export interface CreateMilestoneInput {
  goal_id: string;
  title: string;
  target_date?: string;
  project_refs?: string[];
  notes?: string;
}

export interface VisionGoalDetail {
  goal: VisionGoal;
  milestones: VisionMilestone[];
  alignment?: VisionAlignmentMap;
}

export function isVisionHorizon(value: string): value is VisionHorizon {
  return (VISION_HORIZONS as readonly string[]).includes(value);
}
