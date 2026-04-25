import { describe, expect, it } from 'vitest';
import {
  EXIT_BUSINESS_ERROR,
  EXIT_CONNECTION,
  EXIT_SUCCESS,
  EXIT_USAGE,
  businessError,
  connectionError,
  usageError
} from '../../src/cli/errors';
import { runCli } from '../../src/cli/runner';

function capture(): {
  stdout: string[];
  stderr: string[];
  options: { stdout: (text: string) => void; stderr: (text: string) => void };
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    options: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text)
    }
  };
}

describe('CLI error codes', () => {
  it('assigns stable exit codes', () => {
    expect(usageError('bad').exitCode).toBe(EXIT_USAGE);
    expect(businessError('failed').exitCode).toBe(EXIT_BUSINESS_ERROR);
    expect(connectionError().exitCode).toBe(EXIT_CONNECTION);
  });

  it('returns success for help without connecting to main process', async () => {
    const io = capture();
    await expect(runCli(['--help'], io.options)).resolves.toBe(EXIT_SUCCESS);
    expect(io.stdout.join('')).toContain('Usage: orbit <command> [args]');
    expect(io.stderr.join('')).toBe('');
  });

  it('returns usage code for unknown commands', async () => {
    const io = capture();
    await expect(runCli(['unknown'], io.options)).resolves.toBe(EXIT_USAGE);
    expect(io.stderr.join('')).toContain('unknown_command');
  });

  it('prints JSON errors when --json is set', async () => {
    const io = capture();
    await expect(runCli(['--json', 'unknown'], io.options)).resolves.toBe(EXIT_USAGE);
    expect(JSON.parse(io.stderr.join(''))).toEqual({
      ok: false,
      error: { code: 'unknown_command', message: 'Unknown command: unknown' }
    });
  });

  it('uses business exit code for structured unavailable errors', async () => {
    const io = capture();
    await expect(runCli(['--json', 'feed', 'list'], io.options)).resolves.toBe(EXIT_BUSINESS_ERROR);
    expect(JSON.parse(io.stderr.join('')).error.code).toBe('unavailable');
  });
});
