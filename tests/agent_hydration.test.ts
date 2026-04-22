import { describe, expect, it, vi } from 'vitest';
import { parseHydrationLine, formatHydrationReply } from '../src/main/agent/context';
import type { SearchHit } from '../src/shared/types';

describe('hydration protocol parser', () => {
  it('parses plain @orbit:search lines', () => {
    expect(parseHydrationLine('@orbit:search renderer tests')).toEqual({
      query: 'renderer tests'
    });
  });
  it('tolerates quote/indent prefixes some models emit', () => {
    expect(parseHydrationLine('> @orbit:search foo')).toEqual({ query: 'foo' });
    expect(parseHydrationLine('    @orbit:search bar baz')).toEqual({
      query: 'bar baz'
    });
  });
  it('returns null for non-hydration lines', () => {
    expect(parseHydrationLine('hello world')).toBeNull();
    expect(parseHydrationLine('@orbit:search')).toBeNull();
    expect(parseHydrationLine('{"type":"message"}')).toBeNull();
  });
});

describe('hydration reply formatter and injection flow', () => {
  it('formats hits into a HYDRATION block', () => {
    const hits: SearchHit[] = [
      {
        path: '/v/01_Projects/Foo.md',
        relPath: '01_Projects/Foo.md',
        title: 'Foo',
        score: 1.234
      }
    ];
    const out = formatHydrationReply('foo', hits);
    expect(out).toContain('HYDRATION for "foo" (1 hit)');
    expect(out).toContain('01_Projects/Foo.md');
    expect(out).toContain('/HYDRATION');
  });
  it('handles empty hit lists', () => {
    const out = formatHydrationReply('nope', []);
    expect(out).toContain('(no matches)');
  });

  it('full runner loop: line → search → stdin write', async () => {
    // Simulate the runner's handleLine path in isolation.
    const search = vi.fn(async (_q: string, _limit?: number): Promise<SearchHit[]> => [
      { path: '/v/a.md', relPath: 'a.md', title: 'A', score: 0.5 }
    ]);
    const writes: string[] = [];

    // Copy of the runner's hydrate plumbing, kept tiny to test the contract.
    async function onStdoutLine(line: string): Promise<void> {
      const hyd = parseHydrationLine(line);
      if (!hyd) return;
      const hits = await search(hyd.query);
      writes.push(formatHydrationReply(hyd.query, hits));
    }

    await onStdoutLine('hello');
    await onStdoutLine('@orbit:search tasks');
    expect(search).toHaveBeenCalledWith('tasks');
    expect(writes.length).toBe(1);
    expect(writes[0]).toContain('HYDRATION for "tasks"');
  });
});
