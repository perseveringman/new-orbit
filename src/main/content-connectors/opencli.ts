import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ContentConnector, ContentConnectorContext, ContentParseInput, ParsedContent } from './types';
import {
  canonicalUrlForInput,
  parserHintForPlatform,
  platformForInput,
  sourcePlatformLabel,
  sourceUrlForInput,
  stringOrNull
} from './utils';

const execFileAsync = promisify(execFile);
const OPENCLI_VERSION = '0.1.0';

export function createOpenCliContentConnector(): ContentConnector {
  return {
    id: 'opencli',
    version: OPENCLI_VERSION,
    priority: 100,
    canHandle(input) {
      const platform = platformForInput(input);
      return platform === 'wechat_article' || platform === 'xiaohongshu' || platform === 'x';
    },
    async parse(input, context) {
      return parseWithOpenCli(input, context);
    }
  };
}

async function parseWithOpenCli(input: ContentParseInput, context: ContentConnectorContext): Promise<ParsedContent> {
  const platform = platformForInput(input);
  const sourceUrl = sourceUrlForInput(input);
  const canonicalUrl = canonicalUrlForInput(input, platform);
  const url = canonicalUrl ?? sourceUrl;
  const fetchedAt = (context.now?.() ?? new Date()).toISOString();
  const base = {
    platform,
    parser_hint: stringOrNull(input.parserHint) ?? parserHintForPlatform(platform),
    source_url: sourceUrl,
    canonical_url: canonicalUrl,
    fetched_at: fetchedAt,
    connector_id: 'opencli',
    connector_version: OPENCLI_VERSION
  };
  if (!url || platform === 'unknown') {
    return { ...base, status: 'skipped', error: 'missing_supported_source_url' };
  }

  const commands = commandCandidates(platform, url);
  let lastError = 'opencli_no_command_candidates';
  for (const args of commands) {
    try {
      const { stdout } = await execFileAsync('opencli', args, {
        timeout: context.timeoutMs ?? 12000,
        maxBuffer: 8 * 1024 * 1024
      });
      const parsed = parseOpenCliOutput(stdout, input, base);
      if (parsed.content_markdown?.trim() || parsed.title || parsed.excerpt) return parsed;
      lastError = 'opencli_empty_result';
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    ...base,
    status: 'failed',
    title: stringOrNull(input.title) ?? undefined,
    excerpt: stringOrNull(input.text) ?? undefined,
    error: lastError
  };
}

function commandCandidates(platform: ParsedContent['platform'], url: string): string[][] {
  if (platform === 'wechat_article') return [['weixin', 'download', url, '-f', 'json'], ['weixin', 'download', url, '-f', 'md']];
  if (platform === 'xiaohongshu') return [['xiaohongshu', 'note', url, '-f', 'json'], ['xiaohongshu', 'download', url, '-f', 'md']];
  if (platform === 'x') return [['twitter', 'thread', url, '-f', 'json'], ['twitter', 'article', url, '-f', 'json']];
  return [];
}

function parseOpenCliOutput(
  stdout: string,
  input: ContentParseInput,
  base: Omit<ParsedContent, 'status'>
): ParsedContent {
  const trimmed = stdout.trim();
  const record = parseJsonRecord(trimmed);
  if (record) {
    const title = firstString(record, ['title', 'name', 'headline']) ?? stringOrNull(input.title) ?? sourcePlatformLabel(base.platform);
    const author = firstString(record, ['author', 'author_name', 'nickname', 'user', 'username']);
    const content =
      firstString(record, ['markdown', 'content_markdown', 'content', 'text', 'body']) ??
      stringOrNull(input.text) ??
      '';
    const excerpt = firstString(record, ['excerpt', 'summary', 'description']) ?? stringOrNull(input.text) ?? undefined;
    return {
      ...base,
      status: 'success',
      title,
      author,
      excerpt,
      content_markdown: normalizeMarkdown(content),
      metadata: { output_format: 'json' }
    };
  }
  return {
    ...base,
    status: 'success',
    title: stringOrNull(input.title) ?? sourcePlatformLabel(base.platform),
    excerpt: stringOrNull(input.text) ?? undefined,
    content_markdown: normalizeMarkdown(trimmed || stringOrNull(input.text) || ''),
    metadata: { output_format: 'text' }
  };
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  if (!value.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const joined = value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).join('\n\n');
      if (joined.trim()) return joined.trim();
    }
  }
  return undefined;
}

function normalizeMarkdown(value: string): string | undefined {
  const normalized = value
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .trim()
    .slice(0, 80000);
  return normalized || undefined;
}
