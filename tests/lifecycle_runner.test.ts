import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LifecycleRunner,
  LIFECYCLE_SCENARIO_IDS,
  resolveLifecycleScenarioId
} from '../src/main/dev/lifecycle-runner';

const scenarioDir = path.join(process.cwd(), 'tests', 'fixtures', 'lifecycle', 'tasks');

describe('LifecycleRunner', () => {
  it('parses all lifecycle scenario acceptance frontmatter', async () => {
    const runner = new LifecycleRunner({ scenarioDir });

    const scenarios = await Promise.all(LIFECYCLE_SCENARIO_IDS.map((id) => runner.loadScenario(id)));

    expect(scenarios).toHaveLength(15);
    expect(scenarios[0]?.acceptance.final_task_state).toBe('done');
    expect(scenarios[14]?.acceptance.agent_session_state_sequence).toContain('failed_terminal');
  });

  it('supports both short and filename-style scenario ids', () => {
    expect(resolveLifecycleScenarioId('L01')).toBe('L01');
    expect(resolveLifecycleScenarioId('lifecycle-02-agent-asks-question')).toBe('L02');
    expect(resolveLifecycleScenarioId('missing')).toBeNull();
  });

  it('executes local lifecycle scripts and validates acceptance', async () => {
    const runner = new LifecycleRunner({ scenarioDir });

    await expect(runner.runMany(['L01', 'L02'], 2)).resolves.toEqual([
      {
        scenarioId: 'L01',
        ok: true,
        skipped: false,
        failures: [],
        taskStateSequence: ['todo', 'doing', 'doing', 'done'],
        agentSessionStateSequence: ['idle', 'launching', 'running', 'completed']
      },
      {
        scenarioId: 'L02',
        ok: true,
        skipped: false,
        failures: [],
        taskStateSequence: ['todo', 'doing', 'doing', 'doing'],
        agentSessionStateSequence: ['idle', 'launching', 'running', 'awaiting_user']
      }
    ]);
  });

  it('executes all 15 lifecycle scenarios as acceptance checks', async () => {
    const runner = new LifecycleRunner({ scenarioDir });

    const results = await runner.runMany(LIFECYCLE_SCENARIO_IDS, 5);

    expect(results).toHaveLength(15);
    expect(results.every((result) => result.ok && !result.skipped)).toBe(true);
    expect(results.map((result) => result.scenarioId)).toEqual([...LIFECYCLE_SCENARIO_IDS]);
  });
});
