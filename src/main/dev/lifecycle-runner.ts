import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

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
      return { scenarioId: scenario.id, ok: true, skipped: true, failures: [] };
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

  private async runRealScenario(scenario: LifecycleScenario): Promise<LifecycleRunResult> {
    return {
      scenarioId: scenario.id,
      ok: false,
      skipped: false,
      failures: [
        'Real lifecycle execution requires a running Orbit vault and installed agent CLIs; this framework entry point is ready for local dog-food wiring.'
      ]
    };
  }
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
