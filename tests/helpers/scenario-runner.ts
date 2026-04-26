import path from 'node:path';
import {
  runAgentScenario,
  type AgentScenarioId,
  type ScenarioRunResult
} from '../../src/cli/commands/dev-scenarios';

export function fixtureDirForRepo(): string {
  return path.join(process.cwd(), 'tests', 'fixtures', 'agent-playground');
}

export async function runScenarioInTempDir(
  scenarioId: AgentScenarioId,
  recordDir: string
): Promise<ScenarioRunResult> {
  return runAgentScenario(scenarioId, fixtureDirForRepo(), recordDir);
}
