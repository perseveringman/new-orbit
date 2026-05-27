import {
  DEFAULT_YOUTUBE_SUBTITLE_LANGUAGES,
  defaultYouTubeFeedProvider,
  type YouTubeFeedProvider
} from '../feed/youtube';
import type { ContentConnector, ContentConnectorContext, ContentParseInput, ParsedContent } from './types';
import {
  canonicalUrlForInput,
  clip,
  parserHintForPlatform,
  platformForInput,
  sourceUrlForInput,
  stringOrNull
} from './utils';

const YOUTUBE_CONNECTOR_VERSION = '1.0.0';

export function createYouTubeContentConnector(provider: YouTubeFeedProvider = defaultYouTubeFeedProvider): ContentConnector {
  return {
    id: 'youtube.feed-provider',
    version: YOUTUBE_CONNECTOR_VERSION,
    priority: 90,
    canHandle(input) {
      return platformForInput(input) === 'youtube';
    },
    async parse(input, context) {
      return parseYouTubeVideo(input, context, provider);
    }
  };
}

async function parseYouTubeVideo(
  input: ContentParseInput,
  context: ContentConnectorContext,
  provider: YouTubeFeedProvider
): Promise<ParsedContent> {
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
    connector_id: 'youtube.feed-provider',
    connector_version: YOUTUBE_CONNECTOR_VERSION
  };

  if (!url || platform !== 'youtube') {
    return {
      ...base,
      status: 'skipped',
      title: stringOrNull(input.title) ?? undefined,
      excerpt: stringOrNull(input.text) ?? undefined,
      error: 'missing_youtube_url'
    };
  }

  try {
    const descriptor = provider.normalizeSource(url);
    if (descriptor.source_type !== 'video') {
      return {
        ...base,
        status: 'failed',
        canonical_url: descriptor.url,
        title: stringOrNull(input.title) ?? undefined,
        excerpt: stringOrNull(input.text) ?? undefined,
        error: 'youtube_non_video_source_not_supported',
        metadata: { source_type: descriptor.source_type }
      };
    }

    const videoId = youtubeVideoId(descriptor.url);
    if (!videoId) {
      return {
        ...base,
        status: 'failed',
        canonical_url: descriptor.url,
        title: stringOrNull(input.title) ?? undefined,
        excerpt: stringOrNull(input.text) ?? undefined,
        error: 'youtube_video_id_missing'
      };
    }

    const archive = await provider.fetchArchive(videoId, { subtitleLanguages: DEFAULT_YOUTUBE_SUBTITLE_LANGUAGES });
    const record = provider.buildMarkdown(descriptor.source_type, archive);
    const title = stringValue(archive.info.title) ?? stringOrNull(input.title) ?? `YouTube video ${videoId}`;
    const author = stringValue(archive.info.channel) ?? stringValue(archive.info.uploader) ?? stringValue(archive.info.channel_id);
    const excerpt = record.description
      ? clip(record.description, 500)
      : record.transcript
        ? clip(record.transcript, 500)
        : stringOrNull(input.text) ?? undefined;

    return {
      ...base,
      status: 'success',
      source_url: sourceUrl ?? descriptor.url,
      canonical_url: descriptor.url,
      title,
      author,
      excerpt,
      content_markdown: record.markdown,
      metadata: {
        ...record.metadata,
        has_transcript: Boolean(record.transcript),
        transcript_status: archive.subtitle_status
      }
    };
  } catch (error) {
    return {
      ...base,
      status: 'failed',
      title: stringOrNull(input.title) ?? undefined,
      excerpt: stringOrNull(input.text) ?? undefined,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function youtubeVideoId(value: string): string | null {
  try {
    return new URL(value).searchParams.get('v');
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
