import type { TaskRecord } from '@shared/schemas';

export interface DependencyGraph {
  tasks: Map<string, TaskRecord>;
  edges: Map<string, string[]>;
  reverseEdges: Map<string, Set<string>>;
}

export interface DependencyCycle {
  path: string[];
}

export interface DependencyRef {
  uid: string;
  task: TaskRecord | null;
  status: TaskRecord['status'] | 'missing';
  met: boolean;
  reason: 'missing' | 'not_done' | 'done';
}

export interface DependencyTreeNode {
  uid: string;
  task: TaskRecord | null;
  status: TaskRecord['status'] | 'missing';
  met: boolean;
  children: DependencyTreeNode[];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function taskDependencies(task: Pick<TaskRecord, 'depends_on' | 'pre_conditions'>): string[] {
  return unique([...(task.depends_on ?? []), ...(task.pre_conditions ?? [])]);
}

export function buildDependencyGraph(tasks: readonly TaskRecord[]): DependencyGraph {
  const byUid = new Map<string, TaskRecord>();
  for (const task of tasks) {
    if (task.uid) byUid.set(task.uid, task);
  }

  const edges = new Map<string, string[]>();
  const reverseEdges = new Map<string, Set<string>>();
  for (const task of tasks) {
    if (!task.uid) continue;
    const deps = taskDependencies(task);
    edges.set(task.uid, deps);
    for (const depUid of deps) {
      const dependents = reverseEdges.get(depUid) ?? new Set<string>();
      dependents.add(task.uid);
      reverseEdges.set(depUid, dependents);
    }
  }
  return { tasks: byUid, edges, reverseEdges };
}

export function buildDependencyGraphFromEdges(edges: Map<string, readonly string[]>): DependencyGraph {
  const normalized = new Map<string, string[]>();
  const reverseEdges = new Map<string, Set<string>>();
  for (const [uid, deps] of edges) {
    const uniqueDeps = unique([...deps]);
    normalized.set(uid, uniqueDeps);
    for (const depUid of uniqueDeps) {
      if (!normalized.has(depUid)) normalized.set(depUid, []);
      const dependents = reverseEdges.get(depUid) ?? new Set<string>();
      dependents.add(uid);
      reverseEdges.set(depUid, dependents);
    }
  }
  return { tasks: new Map(), edges: normalized, reverseEdges };
}

export function detectAnyCycle(graph: Pick<DependencyGraph, 'edges'>): DependencyCycle | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function visit(uid: string): DependencyCycle | null {
    if (visiting.has(uid)) {
      const start = stack.indexOf(uid);
      return { path: [...stack.slice(start), uid] };
    }
    if (visited.has(uid)) return null;

    visiting.add(uid);
    stack.push(uid);
    for (const depUid of graph.edges.get(uid) ?? []) {
      const cycle = visit(depUid);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(uid);
    visited.add(uid);
    return null;
  }

  for (const uid of graph.edges.keys()) {
    const cycle = visit(uid);
    if (cycle) return cycle;
  }
  return null;
}

export function detectCycleForUpdate(
  targetTaskUid: string,
  proposedDependsOn: readonly string[],
  tasks: readonly TaskRecord[]
): DependencyCycle | null {
  const graph = buildDependencyGraph(tasks);
  const target = graph.tasks.get(targetTaskUid);
  const legacyPreConditions = target?.pre_conditions ?? [];
  graph.edges.set(targetTaskUid, unique([...proposedDependsOn, ...legacyPreConditions]));
  for (const depUid of proposedDependsOn) {
    if (!graph.edges.has(depUid)) graph.edges.set(depUid, []);
  }
  return detectAnyCycle(graph);
}

export function unmetDependencies(
  task: Pick<TaskRecord, 'depends_on' | 'pre_conditions'>,
  taskIndex: Map<string, TaskRecord>
): DependencyRef[] {
  const out: DependencyRef[] = [];
  for (const uid of taskDependencies(task)) {
    const dep = taskIndex.get(uid) ?? null;
    if (!dep) {
      out.push({ uid, task: null, status: 'missing', met: false, reason: 'missing' });
      continue;
    }
    if (dep.status !== 'done') {
      out.push({ uid, task: dep, status: dep.status, met: false, reason: 'not_done' });
    }
  }
  return out;
}

export function dependencyRefs(
  task: Pick<TaskRecord, 'depends_on' | 'pre_conditions'>,
  taskIndex: Map<string, TaskRecord>
): DependencyRef[] {
  return taskDependencies(task).map((uid) => {
    const dep = taskIndex.get(uid) ?? null;
    if (!dep) return { uid, task: null, status: 'missing', met: false, reason: 'missing' };
    return {
      uid,
      task: dep,
      status: dep.status,
      met: dep.status === 'done',
      reason: dep.status === 'done' ? 'done' : 'not_done'
    };
  });
}

export function dependencyTree(
  rootTaskUid: string,
  taskIndex: Map<string, TaskRecord>
): DependencyTreeNode {
  function visit(uid: string, seen: Set<string>): DependencyTreeNode {
    const task = taskIndex.get(uid) ?? null;
    if (!task || seen.has(uid)) {
      return {
        uid,
        task,
        status: task?.status ?? 'missing',
        met: task?.status === 'done',
        children: []
      };
    }
    const nextSeen = new Set(seen);
    nextSeen.add(uid);
    return {
      uid,
      task,
      status: task.status,
      met: task.status === 'done',
      children: taskDependencies(task).map((depUid) => visit(depUid, nextSeen))
    };
  }
  return visit(rootTaskUid, new Set<string>());
}

export function dependentTasksOf(
  dependencyUid: string,
  tasks: readonly TaskRecord[]
): TaskRecord[] {
  return tasks.filter((task) => taskDependencies(task).includes(dependencyUid));
}
