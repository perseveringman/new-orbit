import { describe, expect, it } from 'vitest';
import {
  decodeCliRequest,
  decodeCliResponse,
  encodeCliMessage,
  splitCliFrames,
  type CliRequest
} from '../../src/shared/cli_protocol';
import { resolveCliSocketPath } from '../../src/cli/bridge';

const vaultPath = '/Users/example/vault';

describe('CLI bridge protocol', () => {
  it('serializes newline-delimited request frames', () => {
    const request: CliRequest = { id: 'req-1', method: 'search', params: { query: 'orbit' } };
    const encoded = encodeCliMessage(request);
    expect(encoded.endsWith('\n')).toBe(true);
    expect(decodeCliRequest(encoded.trimEnd())).toEqual(request);
  });

  it('splits complete frames while preserving partial data', () => {
    const payload = encodeCliMessage({ id: '1', ok: true, data: 1 }) + '{"id"';
    const split = splitCliFrames(payload);
    expect(split.frames).toHaveLength(1);
    expect(decodeCliResponse(split.frames[0] ?? '')).toEqual({ id: '1', ok: true, data: 1 });
    expect(split.rest).toBe('{"id"');
  });

  it('resolves socket path from explicit vault path', () => {
    expect(resolveCliSocketPath({ vaultPath, cwd: '/' })).toBe(`${vaultPath}/.orbit/cli-socket`);
  });
});
