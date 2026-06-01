import path from 'node:path';

export const EVAL_ROOT = path.resolve(process.cwd(), 'eval');
export const DEFAULT_DATA_DIR = path.join(EVAL_ROOT, 'data');
export const DEFAULT_RUNS_DIR = path.join(EVAL_ROOT, 'runs');
export const DEFAULT_WEB_RESULTS_DIR = path.join(EVAL_ROOT, 'web', 'public', 'results');

export function safeSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}
