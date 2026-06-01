export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

export function tokenF1(prediction: string, gold: string): number {
  const predicted = tokens(prediction);
  const expected = tokens(gold);
  if (!predicted.length || !expected.length) return 0;
  const counts = new Map<string, number>();
  for (const token of expected) counts.set(token, (counts.get(token) ?? 0) + 1);
  let overlap = 0;
  for (const token of predicted) {
    const count = counts.get(token) ?? 0;
    if (count <= 0) continue;
    overlap += 1;
    counts.set(token, count - 1);
  }
  if (!overlap) return 0;
  const precision = overlap / predicted.length;
  const recall = overlap / expected.length;
  return round((2 * precision * recall) / (precision + recall));
}

export function sentenceSplit(value: string): string[] {
  return value
    .split(/(?<=[.!?。！？])\s+|\n+/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 8);
}

export function bestSentence(question: string, contexts: string[], maxLength = 520): string {
  const query = new Set(tokens(question));
  const candidates = contexts.flatMap(sentenceSplit);
  const best = candidates
    .map((sentence) => ({ sentence, score: overlapScore(query, sentence) }))
    .sort((a, b) => b.score - a.score || a.sentence.length - b.sentence.length)[0];
  return truncate(best?.sentence ?? contexts.find(Boolean) ?? '', maxLength);
}

export function overlapScore(query: Set<string>, value: string): number {
  if (!query.size) return 0;
  const textTokens = new Set(tokens(value));
  let hits = 0;
  for (const token of query) if (textTokens.has(token)) hits += 1;
  return hits / query.size;
}

export function truncate(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 3).trim()}...`;
}

export function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'this',
  'that',
  'from',
  'what',
  'when',
  'where',
  'which',
  'would',
  'should',
  'could',
  'about',
  'there',
  'their',
  'have',
  'will',
  'your',
  'user',
  'assistant'
]);
