import { promises as fs } from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import * as frontmatter from '../frontmatter';

export const VISION_FILENAME = 'Vision.md';
export const VISION_SECTION_HEADING = '## 北极星 / North Star';

export interface VisionRecord {
  exists: boolean;
  raw: string;
  data: Record<string, unknown>;
  body: string;
}

function visionPath(vaultPath: string): string {
  return path.join(vaultPath, VISION_FILENAME);
}

function defaultVisionContent(): string {
  const uid = nanoid(12);
  const createdAt = new Date().toISOString();
  return [
    '---',
    `uid: ${uid}`,
    'type: vision',
    `created_at: ${createdAt}`,
    '---',
    '# 我的愿景 (North Star)',
    '',
    '> 这个文件是你的北极星。所有项目与任务都应回答：我是否正在朝这里前进？',
    '',
    '## 三年目标',
    '(填写你的长期目标)',
    '',
    '## 当前主线',
    '(当前最重要的 1–3 件事)',
    '',
    '## 价值观 / 原则',
    '(决策时的准绳)',
    ''
  ].join('\n');
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function ensureVision(vaultPath: string): Promise<{ created: boolean; path: string }> {
  const p = visionPath(vaultPath);
  if (await exists(p)) return { created: false, path: p };
  await fs.writeFile(p, defaultVisionContent(), 'utf8');
  return { created: true, path: p };
}

export async function readVision(vaultPath: string): Promise<VisionRecord> {
  const p = visionPath(vaultPath);
  try {
    const raw = await fs.readFile(p, 'utf8');
    const { data, body } = frontmatter.read(raw);
    return { exists: true, raw, data, body };
  } catch {
    return { exists: false, raw: '', data: {}, body: '' };
  }
}

export async function writeVision(vaultPath: string, raw: string): Promise<VisionRecord> {
  const p = visionPath(vaultPath);
  await fs.writeFile(p, raw, 'utf8');
  const { data, body } = frontmatter.read(raw);
  return { exists: true, raw, data, body };
}

export function excerptFromBody(body: string, maxLines = 8): string {
  const lines = body.split(/\r?\n/);
  const out: string[] = [];
  for (const ln of lines) {
    out.push(ln);
    if (out.length >= maxLines) break;
  }
  return out.join('\n').trim();
}
