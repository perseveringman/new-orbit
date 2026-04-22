import { describe, expect, it } from 'vitest';
import { hashEmbed, tokenize, cosine, EMBED_DIM, fnv1a } from '../src/main/vector/embed';

describe('hashEmbed', () => {
  it('is deterministic across calls', () => {
    const a = hashEmbed('Orbit vision: calm collaborator');
    const b = hashEmbed('Orbit vision: calm collaborator');
    expect(a.length).toBe(EMBED_DIM);
    expect(b.length).toBe(EMBED_DIM);
    for (let i = 0; i < EMBED_DIM; i++) expect(a[i]).toBe(b[i]);
  });

  it('produces unit-length vectors for non-empty text', () => {
    const v = hashEmbed('alpha beta gamma delta epsilon');
    let sum = 0;
    for (let i = 0; i < EMBED_DIM; i++) sum += (v[i] ?? 0) * (v[i] ?? 0);
    expect(sum).toBeGreaterThan(0.999);
    expect(sum).toBeLessThan(1.001);
  });

  it('returns all-zeros for empty / whitespace input', () => {
    const v = hashEmbed('   ');
    let sum = 0;
    for (let i = 0; i < EMBED_DIM; i++) sum += (v[i] ?? 0) * (v[i] ?? 0);
    expect(sum).toBe(0);
  });

  it('self-cosine is 1.0 (within tolerance)', () => {
    const v = hashEmbed('shipping the distillation pipeline');
    expect(cosine(v, v)).toBeGreaterThan(0.9999);
  });

  it('unrelated docs have low cosine; overlapping docs have higher cosine', () => {
    const a = hashEmbed('project orbit distillation summary');
    const b = hashEmbed('project orbit archives closure');
    const c = hashEmbed('banana recipe fried rice dinner');
    expect(cosine(a, b)).toBeGreaterThan(cosine(a, c));
  });

  it('tokenize lowercases and drops short tokens', () => {
    expect(tokenize('Hello, WORLD! ok a')).toEqual(['hello', 'world', 'ok']);
  });

  it('fnv1a is stable', () => {
    expect(fnv1a('orbit')).toBe(fnv1a('orbit'));
    expect(fnv1a('orbit')).not.toBe(fnv1a('orbits'));
  });
});
