import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export function captureId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha1').update(value).digest('hex').slice(0, 16)}`;
}

export function truncateText(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'untitled';
}

export function estimateReadingMinutes(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

export function escapeMarkdown(value: string): string {
  return value.replace(/---/g, '—');
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

export function safeVaultRelativePath(input: string, fallbackDir: string, fallbackName: string): string {
  const raw = input.trim() || path.posix.join(fallbackDir, fallbackName);
  const normalized = path.posix.normalize(raw.replace(/\\/g, '/'));
  if (normalized.startsWith('../') || normalized === '..' || path.isAbsolute(normalized)) {
    throw new Error(`target path must stay inside the vault: ${input}`);
  }
  return normalized;
}
