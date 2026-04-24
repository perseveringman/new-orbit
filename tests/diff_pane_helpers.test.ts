import { describe, expect, it } from 'vitest';
import { formatShortSha } from '../src/renderer/src/components/DiffPane';

describe('formatShortSha', () => {
  it('truncates a 40-char sha to 7 chars', () => {
    const sha = 'a'.repeat(40);
    const out = formatShortSha(sha);
    expect(out).toHaveLength(7);
    expect(out).toBe('aaaaaaa');
  });

  it('returns input unchanged when shorter than 7 chars', () => {
    expect(formatShortSha('abc')).toBe('abc');
  });

  it('returns empty string for empty input', () => {
    expect(formatShortSha('')).toBe('');
  });

  it('returns exactly 7 chars for a 7-char input', () => {
    expect(formatShortSha('1234567')).toBe('1234567');
  });
});

describe('classifyPatch', () => {
  it('classifies metadata, hunks, additions, deletions, and context lines', async () => {
    const mod = (await import('../src/renderer/src/components/DiffPane')) as Record<string, unknown>;
    const classifyPatch = mod['classifyPatch'] as
      | ((patch: string) => Array<{ kind: string; text: string }>)
      | undefined;

    expect(classifyPatch).toBeTypeOf('function');

    const lines = classifyPatch?.(
      [
        'diff --git a/src/app.ts b/src/app.ts',
        '@@ -1,2 +1,2 @@',
        '-old line',
        '+new line',
        ' unchanged'
      ].join('\n')
    );

    expect(lines?.map((line) => line.kind)).toEqual(['meta', 'hunk', 'del', 'add', 'ctx']);
  });
});
