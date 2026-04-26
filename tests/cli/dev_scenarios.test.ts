import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXIT_SUCCESS } from '../../src/cli/errors';
import { runCli } from '../../src/cli/runner';
import { capture } from './helpers';

describe('CLI dev scenario commands', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'orbit-cli-scenarios-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('runs Agent Playground scenarios through the CLI', async () => {
    const io = capture();

    await expect(
      runCli(['dev:scenarios', 'run', 'scenario-01', '--record-dir', tempDir], io.options)
    ).resolves.toBe(EXIT_SUCCESS);

    expect(io.stdout.join('')).toContain('PASS\tscenario-01');
    expect(io.stderr.join('')).toBe('');
  });

  it('verifies golden files through the CLI', async () => {
    const io = capture();

    await expect(runCli(['dev:golden', 'verify', '--all'], io.options)).resolves.toBe(
      EXIT_SUCCESS
    );

    expect(io.stdout.join('')).toContain('PASS\tscenario-09');
    expect(io.stderr.join('')).toBe('');
  });
});
