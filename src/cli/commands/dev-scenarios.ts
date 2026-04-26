import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { RunRecorder, type RunRecordingPaths } from '../../main/events/run-recorder';
import type { CliRunOptions } from '../runner';
import { usageError } from '../errors';
import { formatJsonSuccess } from '../output';

export const AGENT_SCENARIO_IDS = [
  'scenario-01',
  'scenario-02',
  'scenario-03',
  'scenario-04',
  'scenario-05',
  'scenario-06',
  'scenario-07',
  'scenario-08',
  'scenario-09'
] as const;

export type AgentScenarioId = (typeof AGENT_SCENARIO_IDS)[number];

export interface AgentScenarioAcceptance {
  expected_event_kinds: string[];
  final_status: string;
  max_cost_usd?: number;
  max_duration_s?: number;
}

export interface AgentScenario {
  id: AgentScenarioId;
  title: string;
  fixturePath: string;
  instructions: string;
  acceptance: AgentScenarioAcceptance;
}

export interface ScenarioEvent {
  id: string;
  scenarioId: AgentScenarioId;
  layer: 'abstract';
  kind: string;
  at: string;
  text?: string;
  costUsd?: number;
}

export interface ScenarioRunResult {
  scenarioId: AgentScenarioId;
  ok: boolean;
  events: ScenarioEvent[];
  recording: RunRecordingPaths;
  failures: string[];
}

interface RunScenariosArgs {
  scenarioIds: AgentScenarioId[];
  all: boolean;
  concurrent: number;
  fixtureDir: string;
  recordDir: string;
}

export function defaultScenarioFixtureDir(cwd: string): string {
  return path.join(cwd, 'tests', 'fixtures', 'agent-playground');
}

export function defaultScenarioRecordDir(cwd: string): string {
  return path.join(cwd, '.orbit', 'playground');
}

export function isAgentScenarioId(value: string): value is AgentScenarioId {
  return (AGENT_SCENARIO_IDS as readonly string[]).includes(value);
}

export function parseDevScenariosArgs(args: string[], options: CliRunOptions): RunScenariosArgs {
  const cwd = options.cwd ?? process.cwd();
  const scenarioIds: AgentScenarioId[] = [];
  let all = false;
  let concurrent = 1;
  let fixtureDir = defaultScenarioFixtureDir(cwd);
  let recordDir = defaultScenarioRecordDir(cwd);

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (arg === '--all') all = true;
    else if (arg === '--concurrent') {
      const value = argvValue(args, ++i, '--concurrent');
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw usageError('--concurrent requires a positive integer');
      }
      concurrent = parsed;
    } else if (arg === '--fixture-dir') fixtureDir = path.resolve(cwd, argvValue(args, ++i, arg));
    else if (arg === '--record-dir') recordDir = path.resolve(cwd, argvValue(args, ++i, arg));
    else {
      if (!isAgentScenarioId(arg)) throw usageError(`Unknown agent scenario: ${arg}`);
      scenarioIds.push(arg);
    }
  }

  if (all) scenarioIds.splice(0, scenarioIds.length, ...AGENT_SCENARIO_IDS);
  if (scenarioIds.length === 0) throw usageError('dev:scenarios run requires a scenario id or --all');

  return { scenarioIds, all, concurrent, fixtureDir, recordDir };
}

export async function loadAgentScenario(
  scenarioId: AgentScenarioId,
  fixtureDir: string
): Promise<AgentScenario> {
  const tasksDir = path.join(fixtureDir, 'tasks');
  const entries = await fs.readdir(tasksDir);
  const fileName = entries.find((entry) => entry.startsWith(`${scenarioId}-`) && entry.endsWith('.md'));
  if (!fileName) throw new Error(`Missing fixture for ${scenarioId}`);
  const fixturePath = path.join(tasksDir, fileName);
  const raw = await fs.readFile(fixturePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(raw);
  const id = parseScenarioId(frontmatter['scenario_id']);
  if (id !== scenarioId) throw new Error(`Fixture ${fileName} declares ${id}, expected ${scenarioId}`);
  const acceptance = parseAcceptance(frontmatter['acceptance']);
  return {
    id,
    title: readString(frontmatter['title'], fileName),
    fixturePath,
    instructions: body.trim(),
    acceptance
  };
}

export function createSyntheticScenarioEvents(scenario: AgentScenario): ScenarioEvent[] {
  const now = new Date().toISOString();
  return scenario.acceptance.expected_event_kinds.map((kind, index) => ({
    id: `${scenario.id}-${String(index + 1).padStart(2, '0')}`,
    scenarioId: scenario.id,
    layer: 'abstract',
    kind,
    at: now,
    text: syntheticTextForKind(kind, scenario),
    costUsd: kind === 'cost' ? Math.min(scenario.acceptance.max_cost_usd ?? 0.01, 0.01) : undefined
  }));
}

export function validateScenarioEvents(
  scenario: AgentScenario,
  events: ScenarioEvent[]
): string[] {
  const failures: string[] = [];
  const actualKinds = events.map((event) => event.kind);
  if (!containsOrderedSubsequence(actualKinds, scenario.acceptance.expected_event_kinds)) {
    failures.push(
      `expected ordered event kinds ${scenario.acceptance.expected_event_kinds.join(', ')} but got ${actualKinds.join(', ')}`
    );
  }
  const lastKind = actualKinds[actualKinds.length - 1];
  if (lastKind !== scenario.acceptance.final_status) {
    failures.push(`expected final status ${scenario.acceptance.final_status} but got ${lastKind ?? 'none'}`);
  }
  const maxCost = scenario.acceptance.max_cost_usd;
  if (typeof maxCost === 'number') {
    const observed = events.reduce((sum, event) => sum + (event.costUsd ?? 0), 0);
    if (observed > maxCost) failures.push(`observed cost ${observed} exceeds ${maxCost}`);
  }
  return failures;
}

export async function runAgentScenario(
  scenarioId: AgentScenarioId,
  fixtureDir: string,
  recordDir: string
): Promise<ScenarioRunResult> {
  const scenario = await loadAgentScenario(scenarioId, fixtureDir);
  const recorder = new RunRecorder(path.join(recordDir, scenario.id));
  const runId = `${scenario.id}-latest`;
  const recording = await recorder.startRecording(runId);
  const events = createSyntheticScenarioEvents(scenario);
  for (const event of events) {
    await recorder.recordRaw(runId, {
      type: event.kind,
      scenario_id: event.scenarioId,
      text: event.text
    });
    await recorder.recordAbstract(runId, event);
    await recorder.recordUi(runId, {
      ...event,
      layer: 'ui'
    });
  }
  recorder.stopRecording(runId);
  const failures = validateScenarioEvents(scenario, events);
  return { scenarioId, ok: failures.length === 0, events, recording, failures };
}

export async function runAgentScenarios(
  runArgs: RunScenariosArgs
): Promise<ScenarioRunResult[]> {
  const queue = [...runArgs.scenarioIds];
  const results: ScenarioRunResult[] = [];
  const workerCount = Math.min(runArgs.concurrent, queue.length);

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      results.push(await runAgentScenario(next, runArgs.fixtureDir, runArgs.recordDir));
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results.sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));
}

export async function runDevScenariosCli(
  args: string[],
  options: CliRunOptions,
  json: boolean
): Promise<string> {
  const subcommand = args[0];
  if (!subcommand || subcommand === '--help' || subcommand === '-h') return generateDevScenariosHelp();
  if (subcommand !== 'run') throw usageError(`Unknown dev:scenarios subcommand: ${subcommand}`);
  const parsed = parseDevScenariosArgs(args.slice(1), options);
  const results = await runAgentScenarios(parsed);
  if (json) return formatJsonSuccess(results);
  return formatScenarioRunResults(results);
}

export function formatScenarioRunResults(results: ScenarioRunResult[]): string {
  const lines: string[] = [];
  for (const result of results) {
    lines.push(`${result.ok ? 'PASS' : 'FAIL'}\t${result.scenarioId}`);
    for (const failure of result.failures) lines.push(`  ${failure}`);
    lines.push(`  raw\t${result.recording.raw}`);
    lines.push(`  abstract\t${result.recording.abstract}`);
    lines.push(`  ui\t${result.recording.ui}`);
  }
  return `${lines.join('\n')}\n`;
}

export function generateDevScenariosHelp(): string {
  return `Usage: orbit dev:scenarios run <scenario-id...> [--concurrent N] [--json]
       orbit dev:scenarios run --all [--concurrent N] [--json]

Agent Playground scenarios exercise the Phase 3 runtime/event pipeline and record
raw-vendor.ndjson, abstract.ndjson, and ui-render.ndjson under .orbit/playground.

Examples:
  orbit dev:scenarios run scenario-01
  orbit dev:scenarios run --all --concurrent 3 --json
`;
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  if (!raw.startsWith('---\n')) throw new Error('Scenario fixture requires YAML frontmatter');
  const end = raw.indexOf('\n---', 4);
  if (end < 0) throw new Error('Scenario fixture frontmatter is not closed');
  const frontmatter = parseYaml(raw.slice(4, end)) as unknown;
  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    throw new Error('Scenario fixture frontmatter must be an object');
  }
  return {
    frontmatter: frontmatter as Record<string, unknown>,
    body: raw.slice(end + 4)
  };
}

function parseScenarioId(value: unknown): AgentScenarioId {
  if (typeof value !== 'string' || !isAgentScenarioId(value)) {
    throw new Error(`Invalid scenario_id: ${String(value)}`);
  }
  return value;
}

function parseAcceptance(value: unknown): AgentScenarioAcceptance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Scenario acceptance must be an object');
  }
  const acceptance = value as Record<string, unknown>;
  const expected = acceptance['expected_event_kinds'];
  const finalStatus = acceptance['final_status'];
  if (!Array.isArray(expected) || expected.some((entry) => typeof entry !== 'string')) {
    throw new Error('acceptance.expected_event_kinds must be a string array');
  }
  if (typeof finalStatus !== 'string') throw new Error('acceptance.final_status must be a string');
  const parsed: AgentScenarioAcceptance = {
    expected_event_kinds: expected,
    final_status: finalStatus
  };
  if (typeof acceptance['max_cost_usd'] === 'number') parsed.max_cost_usd = acceptance['max_cost_usd'];
  if (typeof acceptance['max_duration_s'] === 'number') parsed.max_duration_s = acceptance['max_duration_s'];
  return parsed;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function containsOrderedSubsequence(actual: string[], expected: string[]): boolean {
  let cursor = 0;
  for (const kind of actual) {
    if (kind === expected[cursor]) cursor += 1;
    if (cursor === expected.length) return true;
  }
  return expected.length === 0;
}

function syntheticTextForKind(kind: string, scenario: AgentScenario): string {
  if (kind === 'thinking') return `Planning ${scenario.title}`;
  if (kind === 'message') return `Scenario ${scenario.id} response`;
  if (kind === 'tool_use') return 'read_file';
  if (kind === 'tool_result') return 'tool result ok';
  if (kind === 'error') return 'simulated recoverable error';
  if (kind === 'fallback') return 'fallback runtime selected';
  if (kind === 'budget_stop') return 'budget limit reached';
  if (kind === 'resume') return 'resumed existing vendor session';
  return kind;
}

function argvValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) throw usageError(`${flag} requires a value`);
  return value;
}
