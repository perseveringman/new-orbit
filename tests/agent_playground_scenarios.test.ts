import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_SCENARIO_IDS,
  defaultScenarioFixtureDir,
  loadAgentScenario,
  validateScenarioEvents
} from '../src/cli/commands/dev-scenarios';
import { runScenarioInTempDir } from './helpers/scenario-runner';

describe('Agent Playground scenarios', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'orbit-scenarios-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('loads all nine scenario fixtures', async () => {
    const fixtureDir = defaultScenarioFixtureDir(process.cwd());
    const scenarios = await Promise.all(
      AGENT_SCENARIO_IDS.map((scenarioId) => loadAgentScenario(scenarioId, fixtureDir))
    );

    expect(scenarios).toHaveLength(9);
    expect(scenarios.map((scenario) => scenario.id)).toEqual(AGENT_SCENARIO_IDS);
  });

  it('runs scenario-01 and writes the three recording layers', async () => {
    const result = await runScenarioInTempDir('scenario-01', tempDir);

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(await readFile(result.recording.raw, 'utf8')).toContain('"type":"thinking"');
    expect(await readFile(result.recording.abstract, 'utf8')).toContain('"kind":"message"');
    expect(await readFile(result.recording.ui, 'utf8')).toContain('"layer":"ui"');
  });

  it('reports acceptance failures when expected events are missing', async () => {
    const scenario = await loadAgentScenario('scenario-01', defaultScenarioFixtureDir(process.cwd()));

    expect(validateScenarioEvents(scenario, [])).toEqual([
      'expected ordered event kinds thinking, message, done but got ',
      'expected final status done but got none'
    ]);
  });
});
