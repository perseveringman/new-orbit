/**
 * VisionReader — 把 vault/Vision.md 注入 agent system prompt。
 *
 * 设计参考：plans/swift-vortex-darwin.md §B2 / docs/VISION.md
 *
 * Phase B：以 "## North Star" 段落形式包裹 Vision body，限制长度（默认 4000 字）。
 * 不存在 Vision.md 时返回空字符串（调用方可直接 `[vision, ...].filter(Boolean).join`）。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as frontmatter from '../frontmatter';
import { VISION_FILENAME } from '../vision';

const DEFAULT_MAX_CHARS = 4000;

/**
 * 读取 vault Vision.md body 并包裹成 system prompt 段落。
 *
 * @returns 形如 `## North Star\n\n<body>\n` 的字符串；vault 路径为空、文件不存在或 body 为空时返回 ''。
 */
export async function readVisionForSystemPrompt(
  vaultPath: string | null,
  options: { maxChars?: number } = {}
): Promise<string> {
  if (!vaultPath) return '';
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  try {
    const raw = await fs.readFile(path.join(vaultPath, VISION_FILENAME), 'utf8');
    const { body } = frontmatter.read(raw);
    const trimmed = body.trim();
    if (!trimmed) return '';
    const clipped =
      trimmed.length > maxChars ? `${trimmed.slice(0, maxChars).trimEnd()}\n…` : trimmed;
    return `## North Star\n\n${clipped}\n`;
  } catch {
    return '';
  }
}
