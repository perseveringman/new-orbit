import { describe, it, expect } from 'vitest';
import { parseToolInvocationLine, parseHydrationLine } from '../src/main/agent/context';

describe('agent text-fallback parser (parseToolInvocationLine)', () => {
  it('parses a well-formed invocation', () => {
    const r = parseToolInvocationLine(
      '@orbit:tool:create_task {"title":"hi","priority":"high"}'
    );
    expect(r).toEqual({
      name: 'create_task',
      args: { title: 'hi', priority: 'high' }
    });
  });

  it('tolerates leading "> " markup like the hydration parser', () => {
    const r = parseToolInvocationLine('> @orbit:tool:get_vision');
    expect(r).toEqual({ name: 'get_vision', args: {} });
  });

  it('returns null for non-invocations', () => {
    expect(parseToolInvocationLine('hello world')).toBeNull();
    expect(parseToolInvocationLine('@orbit:search foo')).toBeNull();
    // existing hydration parser still recognises @orbit:search
    expect(parseHydrationLine('@orbit:search foo')).toEqual({ query: 'foo' });
  });

  it('returns null for malformed JSON', () => {
    expect(parseToolInvocationLine('@orbit:tool:create_task {bad json}')).toBeNull();
    expect(parseToolInvocationLine('@orbit:tool:create_task [1,2]')).toBeNull();
  });
});
