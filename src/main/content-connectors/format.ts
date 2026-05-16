import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ParsedContent } from './types';
import { sourcePlatformLabel, stableContentKey } from './utils';

export interface WrittenContentArtifact {
  parsed: ParsedContent;
  path: string;
}

export async function writeParsedContentArtifact(
  vaultPath: string,
  parsed: ParsedContent,
  ownerId: string
): Promise<WrittenContentArtifact | null> {
  if (parsed.status !== 'success' || !parsed.content_markdown?.trim()) return null;
  const key = stableContentKey(parsed.canonical_url ?? parsed.source_url, ownerId);
  const relPath = path.join('.orbit', 'content', 'extracted', key, 'source.md');
  const absPath = path.join(vaultPath, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, formatParsedContentArtifact(parsed), 'utf8');
  return { parsed, path: relPath };
}

export function formatParsedContentArtifact(parsed: ParsedContent): string {
  const lines = [
    '---',
    `platform: ${parsed.platform}`,
    `source_url: ${parsed.source_url ?? ''}`,
    `canonical_url: ${parsed.canonical_url ?? ''}`,
    `fetched_at: ${parsed.fetched_at}`,
    `status: ${parsed.status}`,
    `connector_id: ${parsed.connector_id}`,
    `connector_version: ${parsed.connector_version}`,
    '---',
    '',
    `# ${parsed.title ?? sourcePlatformLabel(parsed.platform)}`,
    '',
    parsed.author ? `Author: ${parsed.author}` : '',
    parsed.excerpt ? `> ${parsed.excerpt}` : '',
    '',
    parsed.content_markdown ?? ''
  ];
  return `${lines.filter((line, index) => line !== '' || lines[index - 1] !== '').join('\n').trim()}\n`;
}
