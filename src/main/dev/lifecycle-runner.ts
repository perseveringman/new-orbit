import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { AgentSessionStatus } from '@shared/orchestration';
import type { TaskStatus } from '@shared/schemas';
import {
  reduceTaskState,
  type TaskStateInput,
  type TaskStateTransition
} from '../task-state/reducer';

export const LIFECYCLE_SCENARIO_IDS = [
  'L01',
  'L02',
  'L03',
  'L04',
  'L05',
  'L06',
  'L07',
  'L08',
  'L09',
  'L10',
  'L11',
  'L12',
  'L13',
  'L14',
  'L15'
] as const;

export type LifecycleScenarioId = (typeof LIFECYCLE_SCENARIO_IDS)[number];

export const LIFECYCLE_SCENARIO_ALIASES: Record<string, LifecycleScenarioId> = {
  'lifecycle-01-simple-complete': 'L01',
  'lifecycle-02-agent-asks-question': 'L02',
  'lifecycle-03-user-replies-resume': 'L03',
  'lifecycle-04-onboarding-protocol-compliance': 'L04',
  'lifecycle-05-onboarding-protocol-violation': 'L05',
  'lifecycle-06-switch-runtime-full-inject': 'L06',
  'lifecycle-07-switch-runtime-compressed-inject': 'L07',
  'lifecycle-08-auto-fallback': 'L08',
  'lifecycle-09-all-runtimes-fail': 'L09',
  'lifecycle-10-dependency-flow': 'L10',
  'lifecycle-11-message-during-blocked': 'L11',
  'lifecycle-12-rejected-review-reflow': 'L12',
  'lifecycle-13-concurrent-5': 'L13',
  'lifecycle-14-multi-turn-continuity': 'L14',
  'lifecycle-15-budget-cap': 'L15'
};

export interface LifecycleAcceptance {
  task_state_sequence?: string[];
  agent_session_state_sequence?: string[];
  user_actions?: Array<{ at_event: string; action: string; payload?: unknown }>;
  final_task_state: string;
  max_total_runtime_minutes?: number;
  budget_max_usd?: number;
}

export interface LifecycleScenario {
  id: LifecycleScenarioId;
  title: string;
  filePath: string;
  body: string;
  acceptance: LifecycleAcceptance;
}

export interface LifecycleRunResult {
  scenarioId: LifecycleScenarioId;
  ok: boolean;
  skipped: boolean;
  failures: string[];
  taskStateSequence: TaskStatus[];
  agentSessionStateSequence: AgentSessionStatus[];
}

interface LifecycleScriptStep {
  input: TaskStateInput;
  pendingDependencies?: readonly string[];
}

interface LifecycleScript {
  initialTaskStatus: TaskStatus;
  initialSessionStatus: AgentSessionStatus;
  initialPendingDependencies?: readonly string[];
  steps: LifecycleScriptStep[];
}

export function isLifecycleScenarioId(value: string): value is LifecycleScenarioId {
  return (LIFECYCLE_SCENARIO_IDS as readonly string[]).includes(value);
}

export function resolveLifecycleScenarioId(value: string): LifecycleScenarioId | null {
  if (isLifecycleScenarioId(value)) return value;
  return LIFECYCLE_SCENARIO_ALIASES[value] ?? null;
}

export class LifecycleRunner {
  constructor(
    private readonly options: {
      scenarioDir: string;
      realAgentExecution?: boolean;
    }
  ) {}

  async loadScenario(id: LifecycleScenarioId): Promise<LifecycleScenario> {
    const entries = await fs.readdir(this.options.scenarioDir);
    const numberPrefix = id.slice(1).toLowerCase();
    const fileName = entries.find(
      (entry) =>
        (entry.startsWith(`${id.toLowerCase()}-`) ||
          entry.startsWith(`lifecycle-${numberPrefix}-`)) &&
        entry.endsWith('.md')
    );
    if (!fileName) throw new Error(`Missing lifecycle scenario: ${id}`);
    const filePath = path.join(this.options.scenarioDir, fileName);
    const raw = await fs.readFile(filePath, 'utf8');
    const { frontmatter, body } = parseFrontmatter(raw);
    const declared = readScenarioId(frontmatter['scenario_id']);
    if (declared !== id) throw new Error(`${fileName} declares ${declared}, expected ${id}`);
    return {
      id,
      title: readString(frontmatter['title'], fileName),
      filePath,
      body,
      acceptance: parseAcceptance(frontmatter['acceptance'])
    };
  }

  async run(id: LifecycleScenarioId): Promise<LifecycleRunResult> {
    const scenario = await this.loadScenario(id);
    if (!this.options.realAgentExecution) {
      return this.runLocalScenario(scenario);
    }
    return this.runRealScenario(scenario);
  }

  async runMany(ids: readonly LifecycleScenarioId[], concurrent = 1): Promise<LifecycleRunResult[]> {
    const queue = [...ids];
    const results: LifecycleRunResult[] = [];
    const workerCount = Math.min(concurrent, queue.length);
    async function worker(this: LifecycleRunner): Promise<void> {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) return;
        results.push(await this.run(next));
      }
    }
    await Promise.all(Array.from({ length: workerCount }, () => worker.call(this)));
    return results.sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));
  }

  private runLocalScenario(scenario: LifecycleScenario): LifecycleRunResult {
    const script = lifecycleScriptFor(scenario.id);
    let taskStatus = script.initialTaskStatus;
    let sessionStatus = script.initialSessionStatus;
    let pendingDependencies = [...(script.initialPendingDependencies ?? [])];
    const taskStateSequence: TaskStatus[] = [taskStatus];
    const agentSessionStateSequence: AgentSessionStatus[] = [sessionStatus];

    for (const step of script.steps) {
      if (step.pendingDependencies) pendingDependencies = [...step.pendingDependencies];
      const transition: TaskStateTransition = reduceTaskState(
        {
          task: { id: scenario.id, status: taskStatus },
          activeRunSegment: { sessionStatus },
          pendingDependencies
        },
        step.input
      );
      taskStatus = transition.newTaskStatus;
      sessionStatus = transition.newSessionStatus;
      taskStateSequence.push(taskStatus);
      agentSessionStateSequence.push(sessionStatus);
    }

    const failures = validateLifecycleResult(
      scenario,
      taskStateSequence,
      agentSessionStateSequence
    );
    return {
      scenarioId: scenario.id,
      ok: failures.length === 0,
      skipped: false,
      failures,
      taskStateSequence,
      agentSessionStateSequence
    };
  }

  private async runRealScenario(scenario: LifecycleScenario): Promise<LifecycleRunResult> {
    return {
      scenarioId: scenario.id,
      ok: false,
      skipped: false,
      taskStateSequence: [scenario.acceptance.final_task_state as TaskStatus],
      agentSessionStateSequence: [],
      failures: [
        'Real lifecycle execution requires a running Orbit vault and installed agent CLIs; this framework entry point is ready for local dog-food wiring.'
      ]
    };
  }
}

function lifecycleScriptFor(id: LifecycleScenarioId): LifecycleScript {
  switch (id) {
    case 'L01':
    case 'L04':
    case 'L05':
    case 'L13':
      return {
        initialTaskStatus: 'todo',
        initialSessionStatus: 'idle',
        steps: [
          { input: { source: 'dispatcher', kind: 'agent_session_started', payload: { sessionStatus: 'launching' } } },
          { input: { source: 'dispatcher', kind: 'agent_session_started', payload: { sessionStatus: 'running' } } },
          { input: { source: 'agent', kind: 'agent_completed', payload: { taskCompleted: true } } }
        ]
      };
    case 'L02':
      return {
        initialTaskStatus: 'todo',
        initialSessionStatus: 'idle',
        steps: [
          { input: { source: 'dispatcher', kind: 'agent_session_started', payload: { sessionStatus: 'launching' } } },
          { input: { source: 'dispatcher', kind: 'agent_session_started', payload: { sessionStatus: 'running' } } },
          { input: { source: 'agent', kind: 'agent_awaiting_user' } }
        ]
      };
    case 'L03':
    case 'L14':
      return {
        initialTaskStatus: 'todo',
        initialSessionStatus: 'idle',
        steps: [
          { input: { source: 'dispatcher', kind: 'agent_session_started', payload: { sessionStatus: 'running' } } },
          { input: { source: 'agent', kind: 'agent_awaiting_user' } },
          { input: { source: 'user', kind: 'user_message_in_chat' } },
          { input: { source: 'agent', kind: 'agent_completed', payload: { taskCompleted: true } } }
        ]
      };
    case 'L06':
    case 'L07':
    case 'L08':
      return {
        initialTaskStatus: 'todo',
        initialSessionStatus: 'idle',
        steps: [
          { input: { source: 'dispatcher', kind: 'agent_session_started', payload: { sessionStatus: 'running' } } },
          { input: { source: 'agent', kind: 'agent_failed', payload: { retryable: true } } },
          { input: { source: 'dispatcher', kind: 'agent_session_started', payload: { sessionStatus: 'launching' } } },
          { input: { source: 'dispatcher', kind: 'agent_session_started', payload: { sessionStatus: 'running' } } },
          { input: { source: 'agent', kind: 'agent_completed', payload: { taskCompleted: true } } }
        ]
      };
    case 'L09':
    case 'L15':
      return {
        initialTaskStatus: 'todo',
        initialSessionStatus: 'idle',
        steps: [
          { input: { source: 'dispatcher', kind: 'agent_session_started', payload: { sessionStatus: 'running' } } },
          { input: { source: 'agent', kind: 'agent_failed', payload: { retryable: false } } }
        ]
      };
    case 'L10':
      return {
        initialTaskStatus: 'blocked',
        initialSessionStatus: 'idle',
        initialPendingDependencies: ['dependency-task'],
        steps: [
          { input: { source: 'system', kind: 'dependency_resolved' }, pendingDependencies: [] },
          { input: { source: 'dispatcher', kind: 'agent_session_started', payload: { sessionStatus: 'launching' } } },
          { input: { source: 'dispatcher', kind: 'agent_session_started', payload: { sessionStatus: 'running' } } },
          { input: { source: 'agent', kind: 'agent_completed', payload: { taskCompleted: true } } }
        ]
      };
    case 'L11':
      return {
        initialTaskStatus: 'blocked',
        initialSessionStatus: 'idle',
        initialPendingDependencies: ['dependency-task'],
        steps: [
          { input: { source: 'user', kind: 'user_message_in_chat' } },
          { input: { source: 'system', kind: 'dependency_resolved' }, pendingDependencies: [] }
        ]
      };
    case 'L12':
      return {
        initialTaskStatus: 'todo',
        initialSessionStatus: 'idle',
        steps: [
          { input: { source: 'dispatcher', kind: 'agent_session_started', payload: { sessionStatus: 'running' } } },
          { input: { source: 'agent', kind: 'agent_completed', payload: { taskCompleted: true } } },
          { input: { source: 'user', kind: 'user_review_action', payload: { action: 'return_to_doing' } } },
          { input: { source: 'dispatcher', kind: 'agent_session_started', payload: { sessionStatus: 'launching' } } },
          { input: { source: 'dispatcher', kind: 'agent_session_started', payload: { sessionStatus: 'running' } } },
          { input: { source: 'agent', kind: 'agent_completed', payload: { taskCompleted: true } } }
        ]
      };
  }
}

function validateLifecycleResult(
  scenario: LifecycleScenario,
  taskStateSequence: readonly TaskStatus[],
  agentSessionStateSequence: readonly AgentSessionStatus[]
): string[] {
  const failures: string[] = [];
  if (taskStateSequence[taskStateSequence.length - 1] !== scenario.acceptance.final_task_state) {
    failures.push(
      `expected final task state ${scenario.acceptance.final_task_state} but got ${taskStateSequence[taskStateSequence.length - 1]}`
    );
  }
  if (
    scenario.acceptance.task_state_sequence &&
    !containsOrderedSubsequence(taskStateSequence, scenario.acceptance.task_state_sequence)
  ) {
    failures.push(
      `expected task state sequence ${scenario.acceptance.task_state_sequence.join(' -> ')} within ${taskStateSequence.join(' -> ')}`
    );
  }
  if (
    scenario.acceptance.agent_session_state_sequence &&
    !containsOrderedSubsequence(
      agentSessionStateSequence,
      scenario.acceptance.agent_session_state_sequence
    )
  ) {
    failures.push(
      `expected agent session sequence ${scenario.acceptance.agent_session_state_sequence.join(' -> ')} within ${agentSessionStateSequence.join(' -> ')}`
    );
  }
  return failures;
}

function containsOrderedSubsequence<T extends string>(
  actual: readonly T[],
  expected: readonly string[]
): boolean {
  let cursor = 0;
  for (const item of actual) {
    if (item === expected[cursor]) cursor += 1;
    if (cursor === expected.length) return true;
  }
  return expected.length === 0;
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  if (!raw.startsWith('---\n')) throw new Error('Lifecycle scenario requires YAML frontmatter');
  const end = raw.indexOf('\n---', 4);
  if (end < 0) throw new Error('Lifecycle scenario frontmatter is not closed');
  const parsed = parseYaml(raw.slice(4, end)) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Lifecycle scenario frontmatter must be an object');
  }
  return { frontmatter: parsed as Record<string, unknown>, body: raw.slice(end + 4).trim() };
}

function readScenarioId(value: unknown): LifecycleScenarioId {
  if (typeof value !== 'string' || !isLifecycleScenarioId(value)) {
    throw new Error(`Invalid lifecycle scenario_id: ${String(value)}`);
  }
  return value;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function parseAcceptance(value: unknown): LifecycleAcceptance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Lifecycle acceptance must be an object');
  }
  const acceptance = value as Record<string, unknown>;
  const finalState = acceptance['final_task_state'];
  if (typeof finalState !== 'string' || !finalState) {
    throw new Error('Lifecycle acceptance.final_task_state is required');
  }
  return {
    task_state_sequence: readStringArray(acceptance['task_state_sequence']),
    agent_session_state_sequence: readStringArray(acceptance['agent_session_state_sequence']),
    user_actions: Array.isArray(acceptance['user_actions'])
      ? (acceptance['user_actions'] as LifecycleAcceptance['user_actions'])
      : undefined,
    final_task_state: finalState,
    max_total_runtime_minutes: readOptionalNumber(acceptance['max_total_runtime_minutes']),
    budget_max_usd: readOptionalNumber(acceptance['budget_max_usd'])
  };
}

function readStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error('Lifecycle acceptance sequence must be a string array');
  }
  return value;
}

function readOptionalNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Lifecycle numeric acceptance must be a number');
  }
  return value;
}
