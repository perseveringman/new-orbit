import { describe, expect, it } from 'vitest';
import { formatJsonError, formatJsonSuccess } from '../../src/cli/output';

const parse = (value: string): unknown => JSON.parse(value);

describe('CLI JSON output', () => {
  it('wraps successful data in a stable envelope', () => {
    expect(parse(formatJsonSuccess([{ relPath: 'README.md' }]))).toEqual({
      ok: true,
      data: [{ relPath: 'README.md' }]
    });
  });

  it('wraps errors in a stable envelope', () => {
    expect(parse(formatJsonError({ code: 'usage_error', message: 'bad args' }))).toEqual({
      ok: false,
      error: { code: 'usage_error', message: 'bad args' }
    });
  });
});
