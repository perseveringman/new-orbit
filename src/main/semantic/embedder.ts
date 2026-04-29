import { createHash } from 'node:crypto';

export const LOCAL_EMBEDDING_MODEL = 'orbit-local-hash-embedding-v1';
export const LOCAL_EMBEDDING_DIMENSIONS = 384;

export interface EmbeddingVector {
  vector: Float32Array;
  model: string;
  dimensions: number;
}

export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export async function embedText(text: string): Promise<EmbeddingVector> {
  const vector = new Float32Array(LOCAL_EMBEDDING_DIMENSIONS);
  const tokens = tokenize(text);
  if (!tokens.length) {
    return { vector, model: LOCAL_EMBEDDING_MODEL, dimensions: LOCAL_EMBEDDING_DIMENSIONS };
  }
  for (const token of tokens) {
    const hash = createHash('sha256').update(token).digest();
    const index = hash.readUInt16BE(0) % LOCAL_EMBEDDING_DIMENSIONS;
    const sign = hash[2] % 2 === 0 ? 1 : -1;
    vector[index] += sign * (1 + Math.log1p(token.length));
  }
  normalize(vector);
  return { vector, model: LOCAL_EMBEDDING_MODEL, dimensions: LOCAL_EMBEDDING_DIMENSIONS };
}

export async function embedTexts(texts: string[]): Promise<EmbeddingVector[]> {
  return Promise.all(texts.map((text) => embedText(text)));
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  if (!aa || !bb) return 0;
  return dot / (Math.sqrt(aa) * Math.sqrt(bb));
}

export function vectorToBuffer(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

export function bufferToVector(buffer: Buffer): Float32Array {
  return new Float32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / Float32Array.BYTES_PER_ELEMENT));
}

export function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .normalize('NFKC')
        .split(/[^a-z0-9\u4e00-\u9fff]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    )
  );
}

function normalize(vector: Float32Array): void {
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (!norm) return;
  for (let i = 0; i < vector.length; i += 1) vector[i] /= norm;
}
