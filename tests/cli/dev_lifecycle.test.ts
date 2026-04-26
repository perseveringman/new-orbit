import { describe, expect, it } from 'vitest';
import { EXIT_SUCCESS } from '../../src/cli/errors';
import { runCli } from '../../src/cli/runner';
import { capture } from './helpers';

describe('CLI dev lifecycle command', () => {
  it('runs lifecycle fixture acceptance checks', async () => {
    const io = capture();

    await expect(runCli(['dev:lifecycle', 'run', 'lifecycle-02-agent-asks-question'], io.options)).resolves.toBe(
      EXIT_SUCCESS
    );

    expect(io.stdout.join('')).toContain('PASS\tL02');
    expect(io.stderr.join('')).toBe('');
  });

  it('runs all lifecycle fixtures through the parser', async () => {
    const io = capture();

    await expect(runCli(['dev:lifecycle', 'run', '--all', '--concurrent', '3'], io.options)).resolves.toBe(
      EXIT_SUCCESS
    );

    expect(io.stdout.join('')).toContain('PASS\tL15');
    expect(io.stderr.join('')).toBe('');
  });
});
