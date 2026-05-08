import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  CreateGoalInput,
  CreateMilestoneInput,
  UpdateGoalInput,
  VisionAlignmentMap,
  VisionDriftWarning,
  VisionGoal,
  VisionGoalDetail,
  VisionHorizon,
  VisionMilestone
} from '@shared/vision';
import { isVisionHorizon } from '@shared/vision';
import { listAreas } from '../area';
import { publishTraceableEvent } from '../events/bus';
import { createNoteStore } from '../note/store';
import { listProjects } from '../project';
import { createResourceStore } from '../resource/store';

interface VisionStoreFile {
  version: 1;
  goals: VisionGoal[];
  milestones: VisionMilestone[];
}

export class GoalStore {
  constructor(private readonly vaultPath: string) {}

  async list(horizon?: VisionHorizon): Promise<VisionGoal[]> {
    const file = await this.read();
    return file.goals
      .filter((goal) => !horizon || goal.horizon === horizon)
      .sort((a, b) => b.priority - a.priority || a.created_at.localeCompare(b.created_at));
  }

  async get(id: string): Promise<VisionGoalDetail | null> {
    const file = await this.read();
    const goal = file.goals.find((item) => item.id === id);
    if (!goal) return null;
    const alignment = (await this.getAlignment()).find((item) => item.goal_id === id);
    return {
      goal,
      milestones: file.milestones.filter((milestone) => milestone.goal_id === id),
      ...(alignment ? { alignment } : {})
    };
  }

  async create(input: CreateGoalInput): Promise<VisionGoal> {
    validateGoalInput(input);
    const now = new Date().toISOString();
    const goal: VisionGoal = {
      id: `goal-${randomUUID()}`,
      title: input.title.trim(),
      horizon: input.horizon,
      description: input.description?.trim() ?? '',
      area_refs: input.area_refs ?? [],
      ...(input.target_outcome ? { target_outcome: input.target_outcome } : {}),
      status: 'active',
      priority: Math.max(0, Math.min(100, input.priority ?? 50)),
      ...(input.parent_goal_id ? { parent_goal_id: input.parent_goal_id } : {}),
      created_at: now,
      updated_at: now
    };
    const file = await this.read();
    file.goals.push(goal);
    for (const milestone of input.milestones ?? []) {
      file.milestones.push(createMilestoneRecord({ ...milestone, goal_id: goal.id }));
    }
    await this.write(file);
    publishVisionEvent('vision.goal.created', goal);
    return goal;
  }

  async update(id: string, patch: UpdateGoalInput): Promise<VisionGoal> {
    const file = await this.read();
    const current = file.goals.find((goal) => goal.id === id);
    if (!current) throw new Error(`vision_goal_not_found:${id}`);
    if (patch.horizon && !isVisionHorizon(patch.horizon)) throw new Error(`invalid_vision_horizon:${patch.horizon}`);
    const next: VisionGoal = {
      ...current,
      ...patch,
      title: patch.title?.trim() ?? current.title,
      description: patch.description?.trim() ?? current.description,
      priority: patch.priority === undefined ? current.priority : Math.max(0, Math.min(100, patch.priority)),
      updated_at: new Date().toISOString()
    };
    if (next.status === 'completed' && !next.completed_at) next.completed_at = next.updated_at;
    file.goals = file.goals.map((goal) => goal.id === id ? next : goal);
    await this.write(file);
    publishVisionEvent('vision.goal.updated', next);
    return next;
  }

  async completeMilestone(id: string): Promise<VisionMilestone> {
    const file = await this.read();
    const milestone = file.milestones.find((item) => item.id === id);
    if (!milestone) throw new Error(`vision_milestone_not_found:${id}`);
    const next = { ...milestone, completed_at: new Date().toISOString() };
    file.milestones = file.milestones.map((item) => item.id === id ? next : item);
    await this.write(file);
    publishTraceableEvent({
      source: 'activity',
      type: 'vision.milestone.completed',
      summary: next.title,
      payload: { milestone_id: next.id, goal_id: next.goal_id }
    });
    return next;
  }

  async addMilestone(input: CreateMilestoneInput): Promise<VisionMilestone> {
    const file = await this.read();
    if (!file.goals.some((goal) => goal.id === input.goal_id)) throw new Error(`vision_goal_not_found:${input.goal_id}`);
    const milestone = createMilestoneRecord(input);
    file.milestones.push(milestone);
    await this.write(file);
    return milestone;
  }

  async getAlignment(): Promise<VisionAlignmentMap[]> {
    const [file, projects, resources, notes] = await Promise.all([
      this.read(),
      listProjects(this.vaultPath),
      createResourceStore(this.vaultPath).list({ include_archived: true }),
      createNoteStore(this.vaultPath).list({ include_archived: true })
    ]);
    return file.goals.map((goal) => {
      const areaSet = new Set(goal.area_refs);
      const activeProjects = projects.filter((project) => project.status !== 'archived' && intersects(project.area_slugs ?? [], areaSet));
      const completedProjects = projects.filter((project) => project.status === 'archived' && intersects(project.area_slugs ?? [], areaSet));
      const resourceCount = resources.filter((resource) => intersects(resource.frontmatter.areas?.map((area) => area.area_slug) ?? [], areaSet)).length;
      const noteCount = notes.filter((note) => intersects(note.frontmatter.areas?.map((area) => area.area_slug) ?? [], areaSet)).length;
      const score = Math.min(100, activeProjects.length * 25 + completedProjects.length * 15 + resourceCount * 10 + noteCount * 2);
      return {
        goal_id: goal.id,
        alignment_score: score,
        evidence: {
          active_projects: activeProjects.length,
          completed_projects: completedProjects.length,
          resources_touched: resourceCount,
          notes_count: noteCount,
          time_spent_hours: 0
        }
      };
    });
  }

  async detectDrift(): Promise<VisionDriftWarning[]> {
    const [goals, areas, alignment] = await Promise.all([this.list(), listAreas(this.vaultPath), this.getAlignment()]);
    const activeAreas = new Set(areas.filter((area) => area.status === 'active').map((area) => area.slug));
    const warnings: VisionDriftWarning[] = [];
    for (const goal of goals.filter((item) => item.status === 'active')) {
      const map = alignment.find((item) => item.goal_id === goal.id);
      for (const area of goal.area_refs) {
        if (!activeAreas.has(area)) {
          warnings.push({
            goal_id: goal.id,
            area_slug: area,
            drift_type: 'inactivity',
            severity: 'medium',
            rationale: `Goal "${goal.title}" is linked to inactive or missing area "${area}".`,
            suggested_action: 'Review the Area or update goal alignment.'
          });
        } else if ((map?.alignment_score ?? 0) < 20) {
          warnings.push({
            goal_id: goal.id,
            area_slug: area,
            drift_type: 'neglect',
            severity: 'high',
            rationale: `Goal "${goal.title}" has low activity alignment.`,
            suggested_action: 'Create a project, resource, or milestone for this goal.'
          });
        }
      }
    }
    return warnings;
  }

  private storeDir(): string {
    return path.join(this.vaultPath, 'vision', '.orbit');
  }

  private storePath(): string {
    return path.join(this.storeDir(), 'vision-store.json');
  }

  private async read(): Promise<VisionStoreFile> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.storePath(), 'utf8')) as Partial<VisionStoreFile>;
      return {
        version: 1,
        goals: Array.isArray(parsed.goals) ? parsed.goals as VisionGoal[] : [],
        milestones: Array.isArray(parsed.milestones) ? parsed.milestones as VisionMilestone[] : []
      };
    } catch (error) {
      if (isNotFound(error)) return { version: 1, goals: [], milestones: [] };
      throw error;
    }
  }

  private async write(file: VisionStoreFile): Promise<void> {
    await fs.mkdir(this.storeDir(), { recursive: true });
    await fs.writeFile(this.storePath(), `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  }
}

export function createGoalStore(vaultPath: string): GoalStore {
  return new GoalStore(vaultPath);
}

function validateGoalInput(input: CreateGoalInput): void {
  if (!input.title.trim()) throw new Error('vision_goal_title_required');
  if (!isVisionHorizon(input.horizon)) throw new Error(`invalid_vision_horizon:${String(input.horizon)}`);
}

function createMilestoneRecord(input: CreateMilestoneInput): VisionMilestone {
  return {
    id: `milestone-${randomUUID()}`,
    goal_id: input.goal_id,
    title: input.title.trim(),
    ...(input.target_date ? { target_date: input.target_date } : {}),
    ...(input.project_refs?.length ? { project_refs: input.project_refs } : {}),
    ...(input.notes ? { notes: input.notes } : {})
  };
}

function intersects(values: string[], set: Set<string>): boolean {
  return values.some((value) => set.has(value));
}

function publishVisionEvent(type: string, goal: VisionGoal): void {
  publishTraceableEvent({
    source: 'activity',
    type,
    summary: goal.title,
    payload: { goal_id: goal.id, horizon: goal.horizon, status: goal.status }
  });
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT');
}
