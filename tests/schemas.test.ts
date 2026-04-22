import { describe, expect, it } from 'vitest';
import { inferTypeFromPath } from '../src/shared/schemas';

describe('PARA folder inference', () => {
  it('maps top-level PARA folders to entity types', () => {
    expect(inferTypeFromPath('01_Projects/Foo.md')).toBe('project');
    expect(inferTypeFromPath('01_Projects/nested/Foo.md')).toBe('project');
    expect(inferTypeFromPath('02_Areas/Health.md')).toBe('area');
    expect(inferTypeFromPath('03_Resources/Book.md')).toBe('resource');
    expect(inferTypeFromPath('04_Archives/2024/Old.md')).toBe('archive');
  });

  it('returns null for non-PARA paths', () => {
    expect(inferTypeFromPath('notes/random.md')).toBeNull();
    expect(inferTypeFromPath('AGENT.md')).toBeNull();
    expect(inferTypeFromPath('')).toBeNull();
  });
});
