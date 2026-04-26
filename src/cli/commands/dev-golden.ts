import { promises as fs } from 'node:fs';
import path from 'node:path';
import { usageError } from '../errors';
import { formatJsonSuccess } from '../output';
import type { CliRunOptions } from '../runner';
import {
  AGENT_SCENARIO_IDS,
  createSyntheticScenarioEvents,
  defaultScenarioFixtureDir,
  isAgentScenarioId,
  loadAgentScenario,
  type AgentScenarioId,
  type ScenarioEvent
} from './dev-scenarios';

export interface GoldenComparison {
  scenarioId: AgentScenarioId;
  ok: boolean;
  goldenPath: string;
  failures: string[];
}

interface GoldenArgs {
  scenarioIds: AgentScenarioId[];
  all: boolean;
  fixtureDir: string;
  goldenDir: string;
}

export function defaultGoldenDir(cwd: string): string {
  return path.join(cwd, 'tests', 'golden', 'agent-playground');
}

export async function runDevGoldenCli(
  args: string[],
  options: CliRunOptions,
  json: boolean
): Promise<string> {
  const subcommand = args[0];
  if (!subcommand || subcommand === '--help' || subcommand === '-h') return generateDevGoldenHelp();
  const parsed = parseDevGoldenArgs(args.slice(1), options);
  if (subcommand === 'update') {
    const paths = await updateGoldenFiles(parsed);
    return json ? formatJsonSuccess(paths) : `${paths.map((item) => `UPDATED\t${item}`).join('\n')}\n`;
  }
  if (subcommand === 'verify') {
    const results = await verifyGoldenFiles(parsed);
    return json ? formatJsonSuccess(results) : formatGoldenComparisons(results);
  }
  throw usageError(`Unknown dev:golden subcommand: ${subcommand}`);
}

export function parseDevGoldenArgs(args: string[], options: CliRunOptions): GoldenArgs {
  const cwd = options.cwd ?? process.cwd();
  const scenarioIds: AgentScenarioId[] = [];
  let all = false;
  let fixtureDir = defaultScenarioFixtureDir(cwd);
  let goldenDir = defaultGoldenDir(cwd);

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (arg === '--all') all = true;
    else if (arg === '--scenario') {
      const value = argvValue(args, ++i, '--scenario');
      if (!isAgentScenarioId(value)) throw usageError(`Unknown agent scenario: ${value}`);
      scenarioIds.push(value);
    } else if (arg === '--fixture-dir') fixtureDir = path.resolve(cwd, argvValue(args, ++i, arg));
    else if (arg === '--golden-dir') goldenDir = path.resolve(cwd, argvValue(args, ++i, arg));
    else {
      if (!isAgentScenarioId(arg)) throw usageError(`Unknown agent scenario: ${arg}`);
      scenarioIds.push(arg);
    }
  }

  if (all) scenarioIds.splice(0, scenarioIds.length, ...AGENT_SCENARIO_IDS);
  if (scenarioIds.length === 0) {
    throw usageError('dev:golden requires --scenario <id>, one or more ids, or --all');
  }
  return { scenarioIds, all, fixtureDir, goldenDir };
}

export async function updateGoldenFiles(args: GoldenArgs): Promise<string[]> {
  await fs.mkdir(args.goldenDir, { recursive: true });
  const paths: string[] = [];
  for (const scenarioId of args.scenarioIds) {
    const scenario = await loadAgentScenario(scenarioId, args.fixtureDir);
    const events = createSyntheticScenarioEvents(scenario);
    const goldenPath = goldenFilePath(args.goldenDir, scenarioId);
    await fs.writeFile(goldenPath, toGoldenNdjson(events), 'utf8');
    paths.push(goldenPath);
  }
  return paths;
}

export async function verifyGoldenFiles(args: GoldenArgs): Promise<GoldenComparison[]> {
  const comparisons: GoldenComparison[] = [];
  for (const scenarioId of args.scenarioIds) {
    const scenario = await loadAgentScenario(scenarioId, args.fixtureDir);
    const events = createSyntheticScenarioEvents(scenario);
    const goldenPath = goldenFilePath(args.goldenDir, scenarioId);
    let expected = '';
    try {
      expected = await fs.readFile(goldenPath, 'utf8');
    } catch {
      comparisons.push({
        scenarioId,
        ok: false,
        goldenPath,
        failures: [`missing golden file: ${goldenPath}`]
      });
      continue;
    }
    const actual = toGoldenNdjson(events);
    comparisons.push(compareGoldenNdjson(scenarioId, goldenPath, expected, actual));
  }
  return comparisons;
}

export function compareGoldenNdjson(
  scenarioId: AgentScenarioId,
  goldenPath: string,
  expected: string,
  actual: string
): GoldenComparison {
  const expectedLines = normalizeLines(expected);
  const actualLines = normalizeLines(actual);
  const failures: string[] = [];
  const count = Math.max(expectedLines.length, actualLines.length);
  for (let i = 0; i < count; i += 1) {
    const expectedLine = expectedLines[i];
    const actualLine = actualLines[i];
    if (expectedLine !== actualLine) {
      failures.push(
        `line ${i + 1}: expected ${expectedLine ?? '<missing>'}, got ${actualLine ?? '<missing>'}`
      );
    }
  }
  return { scenarioId, ok: failures.length === 0, goldenPath, failures };
}

export function toGoldenNdjson(events: ScenarioEvent[]): string {
  return events
    .map((event) =>
      JSON.stringify({
        scenario_id: event.scenarioId,
        kind: event.kind,
        text: event.text,
        cost_usd: event.costUsd
      })
    )
    .join('\n')
    .concat('\n');
}

export function formatGoldenComparisons(results: GoldenComparison[]): string {
  const lines: string[] = [];
  for (const result of results) {
    lines.push(`${result.ok ? 'PASS' : 'FAIL'}\t${result.scenarioId}`);
    for (const failure of result.failures) lines.push(`  ${failure}`);
  }
  return `${lines.join('\n')}\n`;
}

export function generateDevGoldenHelp(): string {
  return `Usage: orbit dev:golden update (--scenario <id>|--all)
       orbit dev:golden verify (--scenario <id>|--all)

Golden files compare normalized Agent Playground event sequences without volatile
timestamps or run identifiers.

Examples:
  orbit dev:golden update --scenario scenario-01
  orbit dev:golden verify --all
`;
}

function goldenFilePath(goldenDir: string, scenarioId: AgentScenarioId): string {
  return path.join(goldenDir, `${scenarioId}.ndjson`);
}

function normalizeLines(value: string): string[] {
  return value
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function argvValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) throw usageError(`${flag} requires a value`);
  return value;
}
