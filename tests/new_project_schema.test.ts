import { describe, expect, it } from 'vitest';
import {
  slugify,
  isValidSlug,
  slugConflicts,
  NewProjectForm
} from '../src/renderer/src/schemas/newProject';

describe('newProject wizard helpers', () => {
  it('slugify turns human names into kebab-case ascii', () => {
    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('  Many   spaces  ')).toBe('many-spaces');
    expect(slugify('Foo_Bar_42')).toBe('foo-bar-42');
    expect(slugify('---weird---')).toBe('weird');
  });

  it('slugify collapses repeated separators and trims length', () => {
    expect(slugify('a!!!!b&&&&c')).toBe('a-b-c');
    const long = 'a'.repeat(200);
    expect(slugify(long).length).toBeLessThanOrEqual(64);
  });

  it('isValidSlug enforces kebab rules', () => {
    expect(isValidSlug('hello')).toBe(true);
    expect(isValidSlug('hello-world')).toBe(true);
    expect(isValidSlug('a')).toBe(true);
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('-hello')).toBe(false);
    expect(isValidSlug('hello-')).toBe(false);
    expect(isValidSlug('Hello')).toBe(false);
    expect(isValidSlug('foo--bar')).toBe(false);
    expect(isValidSlug('x'.repeat(65))).toBe(false);
  });

  it('slugConflicts detects name collisions', () => {
    expect(slugConflicts('foo', ['bar', 'baz'])).toBe(false);
    expect(slugConflicts('foo', ['foo', 'baz'])).toBe(true);
  });

  it('NewProjectForm zod schema rejects invalid slugs', () => {
    const ok = NewProjectForm.safeParse({
      name: 'Foo',
      template: 'blank',
      slug: 'foo',
      description: 'hi'
    });
    expect(ok.success).toBe(true);
    const bad = NewProjectForm.safeParse({
      name: 'Foo',
      template: 'blank',
      slug: '--invalid'
    });
    expect(bad.success).toBe(false);
  });
});
