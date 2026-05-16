import { createBuiltinContentConnector } from './builtin';
import { createOpenCliContentConnector } from './opencli';
import type {
  ContentConnector,
  ContentConnectorAttempt,
  ContentConnectorContext,
  ContentParseInput,
  ParsedContent
} from './types';
import { canonicalUrlForInput, parserHintForPlatform, platformForInput, sourceUrlForInput, stringOrNull } from './utils';

export interface ParseContentOptions extends ContentConnectorContext {
  connectors?: ContentConnector[];
}

export function defaultContentConnectors(): ContentConnector[] {
  return [createOpenCliContentConnector(), createBuiltinContentConnector()];
}

export async function parseContentSource(
  input: ContentParseInput,
  options: ParseContentOptions = {}
): Promise<ParsedContent> {
  const connectors = (options.connectors ?? defaultContentConnectors()).sort((a, b) => b.priority - a.priority);
  const attempts: ContentConnectorAttempt[] = [];
  let bestFailure: ParsedContent | null = null;

  for (const connector of connectors) {
    if (!connector.canHandle(input)) continue;
    try {
      const parsed = await connector.parse(input, options);
      attempts.push({ connector_id: connector.id, status: parsed.status, ...(parsed.error ? { error: parsed.error } : {}) });
      if (parsed.status === 'success' && parsed.content_markdown?.trim()) {
        return { ...parsed, attempts };
      }
      if (parsed.status === 'failed') bestFailure = { ...parsed, attempts: [...attempts] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attempts.push({ connector_id: connector.id, status: 'failed', error: message });
      bestFailure = failedContent(input, connector.id, connector.version, message, attempts, options.now);
    }
  }

  return bestFailure ?? skippedContent(input, attempts, options.now);
}

function failedContent(
  input: ContentParseInput,
  connectorId: string,
  connectorVersion: string,
  error: string,
  attempts: ContentConnectorAttempt[],
  now?: () => Date
): ParsedContent {
  const platform = platformForInput(input);
  return {
    platform,
    parser_hint: stringOrNull(input.parserHint) ?? parserHintForPlatform(platform),
    status: 'failed',
    source_url: sourceUrlForInput(input),
    canonical_url: canonicalUrlForInput(input, platform),
    title: stringOrNull(input.title) ?? undefined,
    excerpt: stringOrNull(input.text) ?? undefined,
    fetched_at: (now?.() ?? new Date()).toISOString(),
    connector_id: connectorId,
    connector_version: connectorVersion,
    error,
    attempts
  };
}

function skippedContent(input: ContentParseInput, attempts: ContentConnectorAttempt[], now?: () => Date): ParsedContent {
  const platform = platformForInput(input);
  return {
    platform,
    parser_hint: stringOrNull(input.parserHint) ?? parserHintForPlatform(platform),
    status: 'skipped',
    source_url: sourceUrlForInput(input),
    canonical_url: canonicalUrlForInput(input, platform),
    title: stringOrNull(input.title) ?? undefined,
    excerpt: stringOrNull(input.text) ?? undefined,
    fetched_at: (now?.() ?? new Date()).toISOString(),
    connector_id: 'none',
    connector_version: '0',
    error: 'no_connector_available',
    attempts
  };
}
