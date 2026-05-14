import { describe, expect, it } from 'vitest';
import { probeVersion, summarizeVersionProbeError } from '../src/main/orchestration/runtime';

describe('runtime version probe', () => {
  it('returns stdout as version when the probe succeeds', async () => {
    const result = await probeVersion(process.execPath, ['-e', 'process.stdout.write("1.2.3\\n")']);

    expect(result).toEqual({ ok: true, version: '1.2.3', error: null });
  });

  it('does not treat a failed stderr stack as the runtime version', async () => {
    const result = await probeVersion(process.execPath, [
      '-e',
      [
        'process.stderr.write("Error: spawn /missing/codex ENOENT\\n");',
        'process.stderr.write("    at ChildProcess._handle.onexit (node:internal/child_process:286:19)\\n");',
        'process.exit(1);'
      ].join('')
    ]);

    expect(result.ok).toBe(false);
    expect(result.version).toBeNull();
    expect(result.error).toBe(
      'Version probe failed: missing executable referenced by CLI wrapper (ENOENT).'
    );
  });

  it('truncates long non-ENOENT probe failures', () => {
    const summary = summarizeVersionProbeError(`Command failed\n${'x'.repeat(260)}`);

    expect(summary).toHaveLength(220);
    expect(summary.endsWith('...')).toBe(true);
  });
});
