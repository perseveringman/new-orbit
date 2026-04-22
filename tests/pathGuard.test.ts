import { describe, expect, it } from 'vitest';
import { assertInsideVault } from '../src/main/pathGuard';
import path from 'node:path';

describe('path-traversal guard', () => {
  const root = '/tmp/vault-guard';

  it('accepts paths inside the vault', () => {
    expect(assertInsideVault(root, 'a.md')).toBe(path.resolve(root, 'a.md'));
    expect(assertInsideVault(root, 'sub/a.md')).toBe(path.resolve(root, 'sub/a.md'));
    expect(assertInsideVault(root, path.join(root, 'x.md'))).toBe(path.resolve(root, 'x.md'));
  });

  it('rejects `..` escapes', () => {
    expect(() => assertInsideVault(root, '../outside.md')).toThrow(/escapes/);
    expect(() => assertInsideVault(root, 'a/../../outside.md')).toThrow(/escapes/);
  });

  it('rejects unrelated absolute paths', () => {
    expect(() => assertInsideVault(root, '/etc/passwd')).toThrow(/escapes/);
  });
});
