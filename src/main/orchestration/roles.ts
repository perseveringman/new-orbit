import { nanoid } from 'nanoid';
import type {
  ImplementationReport,
  ProjectRoleBinding,
  RoleTemplate,
  RoleTemplateVersion
} from '@shared/orchestration';
import type { TaskRecord } from '@shared/schemas';
import { currentSession } from '../fs';
import { listProjects } from '../project';
import { projectRoleBindingsFile, globalRoleTemplatesFile, readJsonFile, writeJsonFile, vaultReportsFile } from './storage';

interface RoleTemplateStore {
  templates: RoleTemplate[];
  versions: RoleTemplateVersion[];
}

const BUILTIN_TEMPLATES: Array<{
  template: RoleTemplate;
  version: RoleTemplateVersion;
}> = [
  {
    template: {
      id: 'role-template-planner',
      slug: 'planner',
      name: 'Planner',
      kind: 'builtin',
      latestVersionId: 'role-template-planner-v1',
      createdAt: '2026-04-25T00:00:00.000Z',
      updatedAt: '2026-04-25T00:00:00.000Z'
    },
    version: {
      id: 'role-template-planner-v1',
      templateId: 'role-template-planner',
      version: 1,
      instructions: '拆解目标、识别依赖、保持全局视角，并优先产出可发布的任务图。',
      skillRefs: ['planning', 'dependency-analysis'],
      providerPreferences: ['claude'],
      defaultConcurrency: 1,
      defaultDispatchMode: 'suggested',
      allowAutonomous: false,
      outputStyle: 'structured',
      changeSummary: '初始内置规划角色',
      createdAt: '2026-04-25T00:00:00.000Z'
    }
  },
  {
    template: {
      id: 'role-template-executor',
      slug: 'executor',
      name: 'Executor',
      kind: 'builtin',
      latestVersionId: 'role-template-executor-v1',
      createdAt: '2026-04-25T00:00:00.000Z',
      updatedAt: '2026-04-25T00:00:00.000Z'
    },
    version: {
      id: 'role-template-executor-v1',
      templateId: 'role-template-executor',
      version: 1,
      instructions: '聚焦落地执行，优先完成任务并输出清晰实施报告。',
      skillRefs: ['implementation', 'validation'],
      providerPreferences: ['claude'],
      defaultConcurrency: 2,
      defaultDispatchMode: 'autonomous',
      allowAutonomous: true,
      outputStyle: 'implementation-report',
      changeSummary: '初始内置执行角色',
      createdAt: '2026-04-25T00:00:00.000Z'
    }
  },
  {
    template: {
      id: 'role-template-reviewer',
      slug: 'reviewer',
      name: 'Reviewer',
      kind: 'builtin',
      latestVersionId: 'role-template-reviewer-v1',
      createdAt: '2026-04-25T00:00:00.000Z',
      updatedAt: '2026-04-25T00:00:00.000Z'
    },
    version: {
      id: 'role-template-reviewer-v1',
      templateId: 'role-template-reviewer',
      version: 1,
      instructions: '保守验证，关注回归、边界条件与可恢复性。',
      skillRefs: ['review', 'risk-analysis'],
      providerPreferences: ['claude'],
      defaultConcurrency: 1,
      defaultDispatchMode: 'suggested',
      allowAutonomous: false,
      outputStyle: 'review',
      changeSummary: '初始内置审查角色',
      createdAt: '2026-04-25T00:00:00.000Z'
    }
  },
  {
    template: {
      id: 'role-template-researcher',
      slug: 'researcher',
      name: 'Researcher',
      kind: 'builtin',
      latestVersionId: 'role-template-researcher-v1',
      createdAt: '2026-04-25T00:00:00.000Z',
      updatedAt: '2026-04-25T00:00:00.000Z'
    },
    version: {
      id: 'role-template-researcher-v1',
      templateId: 'role-template-researcher',
      version: 1,
      instructions: '先证据后结论，补齐上下文并帮助其他角色收敛方向。',
      skillRefs: ['research', 'evidence-gathering'],
      providerPreferences: ['claude'],
      defaultConcurrency: 1,
      defaultDispatchMode: 'suggested',
      allowAutonomous: false,
      outputStyle: 'research',
      changeSummary: '初始内置研究角色',
      createdAt: '2026-04-25T00:00:00.000Z'
    }
  }
];

async function ensureTemplateStore(): Promise<RoleTemplateStore> {
  const filePath = globalRoleTemplatesFile();
  const seeded: RoleTemplateStore = {
    templates: BUILTIN_TEMPLATES.map((entry) => entry.template),
    versions: BUILTIN_TEMPLATES.map((entry) => entry.version)
  };
  const current = await readJsonFile<RoleTemplateStore>(filePath, seeded);
  if (!current.templates.length || !current.versions.length) {
    await writeJsonFile(filePath, seeded);
    return seeded;
  }
  return current;
}

async function projectBindingsFileForUid(vaultPath: string, projectUid: string): Promise<string> {
  const projects = await listProjects(vaultPath);
  const project = projects.find((entry) => entry.uid === projectUid);
  if (!project) throw new Error(`project not found: ${projectUid}`);
  return projectRoleBindingsFile(project.path);
}

export async function listRoleTemplates(): Promise<RoleTemplate[]> {
  const store = await ensureTemplateStore();
  return store.templates;
}

export async function listRoleTemplateVersions(templateId: string): Promise<RoleTemplateVersion[]> {
  const store = await ensureTemplateStore();
  return store.versions
    .filter((version) => version.templateId === templateId)
    .sort((left, right) => left.version - right.version);
}

export async function listProjectRoleBindings(
  vaultPath: string,
  projectUid: string
): Promise<ProjectRoleBinding[]> {
  const filePath = await projectBindingsFileForUid(vaultPath, projectUid);
  return readJsonFile<ProjectRoleBinding[]>(filePath, []);
}

export async function createProjectRoleBinding(
  vaultPath: string,
  projectUid: string,
  binding: ProjectRoleBinding
): Promise<ProjectRoleBinding> {
  const filePath = await projectBindingsFileForUid(vaultPath, projectUid);
  const existing = await readJsonFile<ProjectRoleBinding[]>(filePath, []);
  const createdAt = binding.createdAt || new Date().toISOString();
  const nextBinding: ProjectRoleBinding = {
    ...binding,
    id: binding.id || `binding-${nanoid(10)}`,
    projectUid,
    createdAt,
    updatedAt: new Date().toISOString()
  };
  const next = [...existing.filter((entry) => entry.id !== nextBinding.id), nextBinding].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
  await writeJsonFile(filePath, next);
  return nextBinding;
}

export async function updateProjectRoleBinding(
  vaultPath: string,
  projectUid: string,
  bindingId: string,
  patch: Partial<ProjectRoleBinding>
): Promise<ProjectRoleBinding> {
  const filePath = await projectBindingsFileForUid(vaultPath, projectUid);
  const existing = await readJsonFile<ProjectRoleBinding[]>(filePath, []);
  const current = existing.find((entry) => entry.id === bindingId);
  if (!current) throw new Error(`binding not found: ${bindingId}`);
  const nextBinding: ProjectRoleBinding = {
    ...current,
    ...patch,
    id: bindingId,
    projectUid,
    updatedAt: new Date().toISOString()
  };
  const next = existing.map((entry) => (entry.id === bindingId ? nextBinding : entry));
  await writeJsonFile(filePath, next);
  return nextBinding;
}

export function listBindingTasks(projectUid: string, bindingId: string): TaskRecord[] {
  const sess = currentSession();
  if (!sess) return [];
  return sess.tasks
    .allTasks()
    .filter(
      (task) =>
        task.project_uid === projectUid &&
        (task.role_binding_id === bindingId || task.owner_id === bindingId)
    );
}

export async function listBindingReports(
  vaultPath: string,
  projectUid: string,
  bindingId: string
): Promise<ImplementationReport[]> {
  const reports = await readJsonFile<ImplementationReport[]>(vaultReportsFile(vaultPath), []);
  return reports.filter((report) => report.projectUid === projectUid && report.bindingId === bindingId);
}
