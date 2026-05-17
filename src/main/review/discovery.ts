import { randomUUID } from 'node:crypto';
import type { ReviewAction, ReviewFinding, ReviewHealthOverview, ReviewKind, ReviewRun } from '@shared/review';
import { listAreas } from '../area';
import { createLibraryStore } from '../library/store';
import { createNoteStore } from '../note/store';
import { listProjects } from '../project';
import { createResourceStore } from '../resource/store';

export async function discoverReviewFindings(vaultPath: string, run: ReviewRun): Promise<{ findings: ReviewFinding[]; health: ReviewHealthOverview }> {
  const [projects, areas, notes, resources, library] = await Promise.all([
    listProjects(vaultPath),
    listAreas(vaultPath),
    createNoteStore(vaultPath).list({ include_archived: true }),
    createResourceStore(vaultPath).list({ include_archived: true }),
    createLibraryStore(vaultPath).list({ include_archived: true })
  ]);

  const findings: ReviewFinding[] = [];
  const activeProjects = projects.filter((project) => project.status !== 'archived');
  const unassignedNotes = notes.filter((note) => !note.frontmatter.areas?.length);
  const dormantResources = resources.filter((resource) => resource.frontmatter.status === 'dormant' || !resource.frontmatter.last_engaged);
  const readUndistilled = library.filter((item) => item.frontmatter.status === 'read' && !item.frontmatter.distillation_artifact_ids?.length);
  const unassignedProjects = activeProjects.filter((project) => !project.area_slugs?.length && !project.area_uid);

  if (unassignedNotes.length) {
    findings.push(finding(run, 'suggestion', 'unassigned-note', `有 ${unassignedNotes.length} 条笔记还没有归属领域`, '这些笔记已经进入你的知识库，但还没有连接到长期负责的领域。补上归属后，之后复盘和提问时更容易把它们唤回来。', [
      action('assign_area', '整理这些笔记的领域归属', 'note:unassigned'),
      action('ignore', '这次先略过')
    ]));
  }
  if (dormantResources.length) {
    findings.push(finding(run, 'warning', 'dormant-resource', `有 ${dormantResources.length} 个主题已经很久没有触碰`, '这些主题可能已经过期，也可能值得重新推进。建议选一个最相关的主题更新、归档或补一次触达记录。', [
      action('refresh_resource', '检查沉睡主题是否还值得保留', `resource:${dormantResources[0].frontmatter.slug}`),
      action('ignore', '这次先略过')
    ]));
  }
  if (readUndistilled.length) {
    findings.push(finding(run, 'info', 'library-undistilled', `有 ${readUndistilled.length} 条已读资料还没有提炼`, '这些资料已经读完，但还没有沉淀成自己的笔记或主题素材。时间越久，能复用的细节越容易流失。', [
      action('create_task', '创建一个任务：提炼已读资料', firstProjectTarget(activeProjects)),
      action('ignore', '这次先略过')
    ]));
  }
  if (unassignedProjects.length) {
    findings.push(finding(run, 'suggestion', 'unassigned-project', `有 ${unassignedProjects.length} 个活跃项目还没有对齐领域`, '项目如果没有归属领域，就很难判断它服务于哪个长期方向，也不容易在周/月复盘时看出精力分布。', [
      action('assign_area', '为项目选择所属领域', `project:${unassignedProjects[0].uid}`),
      action('ignore', '这次先略过')
    ]));
  }
  if (!findings.length) {
    findings.push(finding(run, 'info', 'healthy', `${labelForKind(run.kind)}没有发现明显问题`, '当前项目、领域、主题、资料和笔记之间没有发现明显的停滞、沉睡或未归属状态。可以把注意力放回正在推进的事情。', [
      action('ignore', '确认这次复盘')
    ]));
  }

  return {
    findings,
    health: {
      projects: { active: activeProjects.length, stalled: unassignedProjects.length },
      areas: { active: areas.filter((area) => area.status === 'active').length, idle: areas.filter((area) => area.status !== 'active').length },
      resources: { active: resources.filter((resource) => resource.frontmatter.status === 'active').length, dormant: dormantResources.length },
      library: { saved: library.filter((item) => item.frontmatter.status === 'saved').length, read: readUndistilled.length },
      notes: { total: notes.length, unassigned: unassignedNotes.length }
    }
  };
}

function finding(run: ReviewRun, severity: ReviewFinding['severity'], category: string, title: string, rationale: string, actions: ReviewAction[]): ReviewFinding {
  return {
    id: `finding-${randomUUID()}`,
    review_run_id: run.id,
    severity,
    category,
    title,
    rationale,
    evidence: [{ kind: 'stat', description: title }],
    suggested_actions: actions
  };
}

function action(kind: ReviewAction['kind'], description: string, targetRef?: string): ReviewAction {
  return {
    id: `action-${randomUUID()}`,
    kind,
    ...(targetRef ? { target_ref: targetRef } : {}),
    description,
    executed: false
  };
}

function firstProjectTarget(projects: Array<{ uid: string }>): string | undefined {
  return projects[0]?.uid ? `project:${projects[0].uid}` : undefined;
}

function labelForKind(kind: ReviewKind): string {
  const labels: Record<ReviewKind, string> = {
    daily: '每日复盘',
    weekly: '每周复盘',
    monthly: '每月复盘',
    quarterly: '季度复盘',
    area: '领域复盘',
    resource: '主题复盘',
    project: '项目复盘'
  };
  return labels[kind];
}
