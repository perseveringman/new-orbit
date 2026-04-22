/**
 * Offline, deterministic hash-trick embedding. 512-dimensional TF vectors
 * hashed into fixed buckets then L2-normalized. Designed to be "good
 * enough" for the M7 experience-wakeup feature without a network call.
 *
 * To replace with a real embedding provider, implement `EmbeddingProvider`
 * below and wire it in via `getEmbedder()`.
 */

export const EMBED_DIM = 512;

export interface EmbeddingProvider {
  readonly dim: number;
  embed(text: string): Float32Array;
}

const WORD_RE = /[a-z0-9]+/g;

/** Tokenize on unicode-friendly word boundaries; lowercase. */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(lower)) !== null) {
    if (m[0].length >= 2) out.push(m[0]);
  }
  return out;
}

/**
 * FNV-1a 32-bit hash. Deterministic across runs, no deps, fast enough for
 * vault-scale corpora.
 */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // Math.imul keeps this within 32-bit signed range.
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Hash-trick bag-of-words → Float32Array of length `EMBED_DIM`. Returns a
 * unit-length vector (or all-zero when `text` has no tokens).
 */
export function hashEmbed(text: string, dim = EMBED_DIM): Float32Array {
  const v = new Float32Array(dim);
  const toks = tokenize(text);
  if (toks.length === 0) return v;
  for (const t of toks) {
    const bucket = fnv1a(t) % dim;
    v[bucket] = (v[bucket] ?? 0) + 1;
  }
  // L2 normalize
  let sum = 0;
  for (let i = 0; i < dim; i++) sum += (v[i] ?? 0) * (v[i] ?? 0);
  const norm = Math.sqrt(sum);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) v[i] = (v[i] ?? 0) / norm;
  }
  return v;
}

/** Cosine similarity assuming both inputs are already unit-normalized. */
export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

const hashProvider: EmbeddingProvider = {
  dim: EMBED_DIM,
  embed: (text: string) => hashEmbed(text)
};

let active: EmbeddingProvider = hashProvider;

export function getEmbedder(): EmbeddingProvider {
  return active;
}

/** Test/plug-in seam. Swap in a real provider by calling this at boot. */
export function setEmbedder(p: EmbeddingProvider): void {
  active = p;
}
