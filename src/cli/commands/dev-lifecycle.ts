import path from 'node:path';
import {
  LifecycleRunner,
  LIFECYCLE_SCENARIO_IDS,
  resolveLifecycleScenarioId,
  type LifecycleScenarioId,
  type LifecycleRunResult
} from '../../main/dev/lifecycle-runner';
import type { CliRunOptions } from '../runner';
import { usageError } from '../errors';
import { formatJsonSuccess } from '../output';

interface RunLifecycleArgs {
  scenarioIds: LifecycleScenarioId[];
  concurrent: number;
  scenarioDir: string;
  realAgentExecution: boolean;
}

export function defaultLifecycleScenarioDir(cwd: string): string {
  return path.join(cwd, 'tests', 'fixtures', 'lifecycle', 'tasks');
}

export function parseDevLifecycleArgs(args: string[], options: CliRunOptions): RunLifecycleArgs {
  const cwd = options.cwd ?? process.cwd();
  const scenarioIds: LifecycleScenarioId[] = [];
  let concurrent = 1;
  let all = false;
  let scenarioDir = defaultLifecycleScenarioDir(cwd);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (arg === '--all') all = true;
    else if (arg === '--concurrent') {
      const parsed = Number(argvValue(args, ++i, '--concurrent'));
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw usageError('--concurrent requires a positive integer');
      }
      concurrent = parsed;
    } else if (arg === '--scenario-dir') {
      scenarioDir = path.resolve(cwd, argvValue(args, ++i, '--scenario-dir'));
    } else {
      const scenarioId = resolveLifecycleScenarioId(arg);
      if (!scenarioId) throw usageError(`Unknown lifecycle scenario: ${arg}`);
      scenarioIds.push(scenarioId);
    }
  }
  if (all) scenarioIds.splice(0, scenarioIds.length, ...LIFECYCLE_SCENARIO_IDS);
  if (scenarioIds.length === 0) throw usageError('dev:lifecycle run requires a scenario id or --all');
  return {
    scenarioIds,
    concurrent,
    scenarioDir,
    realAgentExecution: options.env?.['ORBIT_LIFECYCLE_REAL'] === '1' || process.env['ORBIT_LIFECYCLE_REAL'] === '1'
  };
}

export async function runDevLifecycleCli(
  args: string[],
  options: CliRunOptions,
  json: boolean
): Promise<string> {
  const subcommand = args[0];
  if (!subcommand || subcommand === '--help' || subcommand === '-h') return generateDevLifecycleHelp();
  if (subcommand !== 'run') throw usageError(`Unknown dev:lifecycle subcommand: ${subcommand}`);
  const parsed = parseDevLifecycleArgs(args.slice(1), options);
  const runner = new LifecycleRunner({
    scenarioDir: parsed.scenarioDir,
    realAgentExecution: parsed.realAgentExecution
  });
  const results = await runner.runMany(parsed.scenarioIds, parsed.concurrent);
  if (json) return formatJsonSuccess(results);
  return formatLifecycleResults(results);
}

export function formatLifecycleResults(results: LifecycleRunResult[]): string {
  return `${results
    .map((result) => {
      const status = result.skipped ? 'SKIP' : result.ok ? 'PASS' : 'FAIL';
      const failures = result.failures.map((failure) => `  ${failure}`).join('\n');
      return `${status}\t${result.scenarioId}${failures ? `\n${failures}` : ''}`;
    })
    .join('\n')}\n`;
}

export function generateDevLifecycleHelp(): string {
  return `Usage: orbit dev:lifecycle run [--all|--concurrent N|<scenario-id...>]

Lifecycle scenarios exercise Phase 4.0 task/session/runtime lifecycle behavior.
By default this command validates scenario fixtures and reports SKIP; set
ORBIT_LIFECYCLE_REAL=1 in a machine with Orbit + agent CLIs to execute real runs.
`;
}

function argvValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) throw usageError(`${flag} requires a value`);
  return value;
}
