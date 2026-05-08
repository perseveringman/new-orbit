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
    findings.push(finding(run, 'suggestion', 'unassigned-note', `${unassignedNotes.length} notes are not assigned to Areas`, 'Unassigned notes are hard to connect to long-running Areas.', [
      action('assign_area', 'Open Area assignment queue', 'note:unassigned'),
      action('ignore', 'Ignore for this review')
    ]));
  }
  if (dormantResources.length) {
    findings.push(finding(run, 'warning', 'dormant-resource', `${dormantResources.length} resources need engagement`, 'Dormant resources may be stale or ready for refresh/archive.', [
      action('refresh_resource', 'Review dormant resources', `resource:${dormantResources[0].frontmatter.slug}`),
      action('ignore', 'Ignore for this review')
    ]));
  }
  if (readUndistilled.length) {
    findings.push(finding(run, 'info', 'library-undistilled', `${readUndistilled.length} read library items are not distilled`, 'Read source material can decay unless distilled or accepted into notes.', [
      action('create_task', 'Create task to distill read library items', firstProjectTarget(activeProjects)),
      action('ignore', 'Ignore for this review')
    ]));
  }
  if (unassignedProjects.length) {
    findings.push(finding(run, 'suggestion', 'unassigned-project', `${unassignedProjects.length} active projects are not aligned to Areas`, 'Projects without Area alignment are harder to review and balance.', [
      action('assign_area', 'Assign project to an Area', `project:${unassignedProjects[0].uid}`),
      action('ignore', 'Ignore for this review')
    ]));
  }
  if (!findings.length) {
    findings.push(finding(run, 'info', 'healthy', `${labelForKind(run.kind)} review found no major issues`, 'Current PARA state has no obvious stale, dormant, or unassigned anomalies.', [
      action('ignore', 'Acknowledge healthy review')
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
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
