import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FeedTranscriptSegment, FeedTranscriptTrackSourceKind } from '@shared/feed';

export type YouTubeSourceType = 'channel' | 'playlist' | 'video';
export type YouTubeSubtitleFormat = 'json3' | 'vtt';
export type YouTubeSubtitleStatus = 'captured' | 'available_but_not_downloaded' | 'not_exposed';

export interface YouTubeSourceDescriptor {
  url: string;
  source_type: YouTubeSourceType;
}

export interface YouTubeVideoCandidate {
  id: string;
  title: string;
  url: string;
  canonical_url: string;
}

export type YouTubeInfoRecord = Record<string, unknown>;

export interface YouTubeVideoArchive {
  info: YouTubeInfoRecord;
  subtitle_content: string | null;
  subtitle_format: YouTubeSubtitleFormat | null;
  subtitle_language?: string;
  subtitle_tracks: YouTubeSubtitleArchiveTrack[];
  subtitle_status: YouTubeSubtitleStatus;
  subtitle_requested_languages: string[];
  subtitle_available_languages: string[];
  automatic_caption_languages: string[];
  subtitle_download_errors?: string[];
}

export interface YouTubeSubtitleArchiveTrack {
  language: string;
  label: string;
  source_kind: Extract<FeedTranscriptTrackSourceKind, 'manual' | 'auto'>;
  file_name: string;
  content: string;
  format: YouTubeSubtitleFormat;
  segments: FeedTranscriptSegment[];
  transcript: string | null;
}

export interface YouTubeMarkdownRecord {
  markdown: string;
  metadata: FeedYouTubeMetadata;
  transcript: string | null;
  description?: string;
}

export interface FeedYouTubeMetadata {
  provider: 'youtube';
  external_id: string;
  source_type: YouTubeSourceType;
  source_url?: string;
  video_url: string;
  thumbnail_url?: string;
  channel_name?: string;
  channel_id?: string;
  uploader_id?: string;
  uploader_url?: string;
  published_at?: string;
  upload_date?: string;
  duration_seconds?: number;
  duration_human?: string;
  view_count?: number;
  like_count?: number;
  language?: string;
  availability?: string;
  has_transcript: boolean;
  subtitle_format?: YouTubeSubtitleFormat;
  subtitle_language?: string;
  subtitle_status?: YouTubeSubtitleStatus;
  subtitle_requested_languages?: string[];
  subtitle_available_languages?: string[];
  automatic_caption_languages?: string[];
  subtitle_track_count?: number;
  subtitle_languages?: string[];
  preferred_transcript_track_id?: string;
  subtitle_download_errors?: string[];
}

export interface YouTubeArchiveOptions {
  subtitleLanguages?: string[];
}

export interface YouTubeListOptions {
  limit?: number;
}

export interface YouTubeFeedProvider {
  normalizeSource(input: string): YouTubeSourceDescriptor;
  listCandidates(source: YouTubeSourceDescriptor, options?: YouTubeListOptions): Promise<YouTubeVideoCandidate[]>;
  fetchArchive(videoId: string, options?: YouTubeArchiveOptions): Promise<YouTubeVideoArchive>;
  buildMarkdown(sourceType: YouTubeSourceType, archive: YouTubeVideoArchive): YouTubeMarkdownRecord;
}

const DEFAULT_SUBTITLE_LANGUAGES = ['en', 'zh-Hans', 'zh'];
const YT_DLP_SHARED_ARGS = [
  '--no-warnings',
  '--cookies-from-browser',
  'chrome',
  '--remote-components',
  'ejs:github'
];
const YT_DLP_YOUTUBE_TAB_ARGS = ['--extractor-args', 'youtubetab:skip=authcheck'];

export const defaultYouTubeFeedProvider: YouTubeFeedProvider = {
  normalizeSource: normalizeYouTubeSource,
  listCandidates: listYouTubeCandidates,
  fetchArchive: fetchYouTubeArchive,
  buildMarkdown: buildYouTubeMarkdown
};

export function normalizeYouTubeSource(input: string): YouTubeSourceDescriptor {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('A YouTube channel, playlist, handle, or video link is required.');

  if (!/^https?:\/\//i.test(trimmed)) {
    if (/^(UC|HC)[A-Za-z0-9_-]{20,}$/.test(trimmed)) {
      return {
        url: `https://www.youtube.com/channel/${trimmed}/videos`,
        source_type: 'channel'
      };
    }

    const handle = trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
    return {
      url: `https://www.youtube.com/${handle}/videos`,
      source_type: 'channel'
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid YouTube URL.');
  }

  const host = parsed.hostname.replace(/^www\./, '').replace(/^m\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be') {
    throw new Error('Only YouTube links are supported for YouTube feed sources.');
  }

  if (host === 'youtu.be') {
    const videoId = parsed.pathname.split('/').filter(Boolean)[0];
    if (!videoId) throw new Error('Invalid YouTube video link.');
    return {
      url: `https://www.youtube.com/watch?v=${videoId}`,
      source_type: 'video'
    };
  }

  const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  const segments = pathname.split('/').filter(Boolean);
  const watchVideoId = parsed.searchParams.get('v');

  if (watchVideoId) {
    return {
      url: `https://www.youtube.com/watch?v=${watchVideoId}`,
      source_type: 'video'
    };
  }

  if (segments[0] === 'playlist') {
    const playlistId = parsed.searchParams.get('list');
    if (!playlistId) throw new Error('Invalid YouTube playlist link.');
    return {
      url: `https://www.youtube.com/playlist?list=${playlistId}`,
      source_type: 'playlist'
    };
  }

  if (segments[0] === 'shorts' || segments[0] === 'live') {
    const videoId = segments[1];
    if (!videoId) throw new Error('Invalid YouTube video link.');
    return {
      url: `https://www.youtube.com/watch?v=${videoId}`,
      source_type: 'video'
    };
  }

  if (segments[0]?.startsWith('@')) {
    return {
      url: `https://www.youtube.com/${segments[0]}/videos`,
      source_type: 'channel'
    };
  }

  if (['channel', 'c', 'user'].includes(segments[0] ?? '') && segments[1]) {
    return {
      url: `https://www.youtube.com/${segments[0]}/${segments[1]}/videos`,
      source_type: 'channel'
    };
  }

  throw new Error('Unsupported YouTube source. Use a channel, playlist, handle, or video URL.');
}

export function youtubeSourceTitle(source: YouTubeSourceDescriptor): string {
  try {
    const url = new URL(source.url);
    const handle = url.pathname.split('/').filter(Boolean).find((segment) => segment.startsWith('@'));
    if (handle) return handle;
    const list = url.searchParams.get('list');
    if (list) return `YouTube playlist ${list}`;
    const video = url.searchParams.get('v');
    if (video) return `YouTube video ${video}`;
    const segments = url.pathname.split('/').filter(Boolean);
    return segments.at(-1) ? `YouTube ${segments.at(-1)}` : 'YouTube source';
  } catch {
    return 'YouTube source';
  }
}

async function listYouTubeCandidates(source: YouTubeSourceDescriptor, options: YouTubeListOptions = {}): Promise<YouTubeVideoCandidate[]> {
  const playlistLimitArgs =
    source.source_type !== 'video' && options.limit && options.limit > 0 ? ['--playlist-end', String(options.limit)] : [];
  const args =
    source.source_type === 'video'
      ? ['--no-playlist', '--print', '%(id)s\t%(title)s', ...YT_DLP_SHARED_ARGS, source.url]
      : [
          '--flat-playlist',
          ...playlistLimitArgs,
          '--print',
          '%(id)s\t%(title)s',
          ...YT_DLP_SHARED_ARGS,
          ...YT_DLP_YOUTUBE_TAB_ARGS,
          source.url
        ];
  const { stdout } = await runYtDlp(args);
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, ...titleParts] = line.split('\t');
      const videoId = id?.trim() ?? '';
      return {
        id: videoId,
        title: titleParts.join('\t').trim() || videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        canonical_url: `https://www.youtube.com/watch?v=${videoId}`
      };
    })
    .filter((candidate) => candidate.id.length > 0);
}

async function fetchYouTubeArchive(videoId: string, options: YouTubeArchiveOptions = {}): Promise<YouTubeVideoArchive> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-youtube-'));
  const outputTemplate = path.join(tmpDir, `${videoId}.%(ext)s`);
  const subtitleLanguages = normalizeSubtitleLanguages(options.subtitleLanguages);

  try {
    const archive = await downloadYouTubeArchive(videoId, tmpDir, outputTemplate, subtitleLanguages);
    const info = archive.info;
    const manualLanguages = subtitleLanguageKeys(info.subtitles);
    const automaticLanguages = subtitleLanguageKeys(info.automatic_captions);
    const attemptedLanguages = [...subtitleLanguages];
    const subtitleDownloadErrors: string[] = archive.error ? [archive.error] : [];
    let subtitleFiles = await listSubtitleFiles(tmpDir);
    let subtitleTracks = await readSubtitleTracks(subtitleFiles, manualLanguages, automaticLanguages);

    if (subtitleTracks.length === 0) {
      const fallbackLanguage = chooseFallbackSubtitleLanguage(manualLanguages, automaticLanguages, subtitleLanguages);
      if (fallbackLanguage && !attemptedLanguages.includes(fallbackLanguage)) {
        const result = await downloadYouTubeSubtitleLanguage(videoId, tmpDir, outputTemplate, fallbackLanguage);
        attemptedLanguages.push(fallbackLanguage);
        if (result.error) subtitleDownloadErrors.push(`${fallbackLanguage}: ${result.error}`);
        subtitleFiles = await listSubtitleFiles(tmpDir);
        subtitleTracks = await readSubtitleTracks(subtitleFiles, manualLanguages, automaticLanguages);
      }
    }

    const primaryTrack = chooseSubtitleTrack(subtitleTracks, attemptedLanguages);
    const subtitleStatus: YouTubeSubtitleStatus = subtitleTracks.length > 0
      ? 'captured'
      : manualLanguages.length > 0 || automaticLanguages.length > 0
        ? 'available_but_not_downloaded'
        : 'not_exposed';

    return {
      info,
      subtitle_content: primaryTrack?.content ?? null,
      subtitle_format: primaryTrack?.format ?? null,
      subtitle_tracks: subtitleTracks,
      subtitle_status: subtitleStatus,
      subtitle_requested_languages: attemptedLanguages,
      subtitle_available_languages: manualLanguages,
      automatic_caption_languages: automaticLanguages,
      ...(subtitleDownloadErrors.length > 0 ? { subtitle_download_errors: subtitleDownloadErrors } : {}),
      ...(primaryTrack ? { subtitle_language: primaryTrack.language } : {})
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function downloadYouTubeArchive(
  videoId: string,
  tmpDir: string,
  outputTemplate: string,
  subtitleLanguages: string[]
): Promise<{ info: YouTubeInfoRecord; error?: string }> {
  let archiveError: string | undefined;
  try {
    await runYtDlp(buildYouTubeArchiveArgs(videoId, outputTemplate, subtitleLanguages));
  } catch (error) {
    archiveError = error instanceof Error ? error.message : String(error);
  }

  const info = await readDownloadedYouTubeInfo(tmpDir);
  if (info) return { info, ...(archiveError ? { error: archiveError } : {}) };

  if (archiveError) {
    if (isYtDlpRateLimitedError(archiveError)) throw new Error(archiveError);
    try {
      return { info: await fetchYouTubeInfo(videoId), error: archiveError };
    } catch {
      throw new Error(archiveError);
    }
  }

  throw new Error(`yt-dlp did not produce video metadata for ${videoId}.`);
}

async function readDownloadedYouTubeInfo(tmpDir: string): Promise<YouTubeInfoRecord | null> {
  const files = await fs.readdir(tmpDir);
  const infoFile = files.find((file) => file.endsWith('.info.json'));
  if (!infoFile) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(tmpDir, infoFile), 'utf8')) as YouTubeInfoRecord;
  } catch {
    return null;
  }
}

async function readSubtitleTracks(
  files: string[],
  manualLanguages: string[],
  automaticLanguages: string[]
): Promise<YouTubeSubtitleArchiveTrack[]> {
  const tracks = await Promise.all(
    files.map(async (file) => {
      const language = subtitleLanguageFromFilename(file) ?? 'und';
      const format = file.endsWith('.json3') ? 'json3' : file.endsWith('.vtt') ? 'vtt' : null;
      if (!format) return null;
      const content = await fs.readFile(file, 'utf8');
      const segments = subtitleToSegments(content, format);
      const sourceKind = subtitleSourceKind(file, language, manualLanguages, automaticLanguages);
      return {
        language,
        label: `${languageLabel(language)} ${sourceKind === 'auto' ? 'auto' : 'manual'}`,
        source_kind: sourceKind,
        file_name: path.basename(file),
        content,
        format,
        segments,
        transcript: segmentsToTranscript(segments)
      } satisfies YouTubeSubtitleArchiveTrack;
    })
  );
  return tracks.filter((track): track is YouTubeSubtitleArchiveTrack => track !== null && track.segments.length > 0);
}

function subtitleSourceKind(
  file: string,
  language: string,
  manualLanguages: string[],
  automaticLanguages: string[]
): Extract<FeedTranscriptTrackSourceKind, 'manual' | 'auto'> {
  if (/\.auto\./i.test(path.basename(file))) return 'auto';
  const hasManual = manualLanguages.some((item) => item.toLowerCase() === language.toLowerCase());
  const hasAutomatic = automaticLanguages.some((item) => item.toLowerCase() === language.toLowerCase());
  return !hasManual && hasAutomatic ? 'auto' : 'manual';
}

function chooseSubtitleTrack(tracks: YouTubeSubtitleArchiveTrack[], languagePriority: string[]): YouTubeSubtitleArchiveTrack | null {
  if (tracks.length === 0) return null;
  const scored = tracks.map((track) => ({
    track,
    score: subtitleLanguagePriorityScore(track.language, languagePriority) + (track.source_kind === 'auto' ? 1 : 0)
  }));
  scored.sort((a, b) => a.score - b.score || a.track.language.localeCompare(b.track.language));
  return scored[0]?.track ?? null;
}

async function fetchYouTubeInfo(videoId: string): Promise<YouTubeInfoRecord> {
  const { stdout } = await runYtDlp(buildYouTubeInfoArgs(videoId));
  try {
    return JSON.parse(stdout) as YouTubeInfoRecord;
  } catch {
    throw new Error(`yt-dlp produced invalid video metadata for ${videoId}.`);
  }
}

async function downloadYouTubeSubtitleLanguage(
  videoId: string,
  tmpDir: string,
  outputTemplate: string,
  language: string
): Promise<{ files: string[]; error?: string }> {
  try {
    await runYtDlp(buildYouTubeArchiveArgs(videoId, outputTemplate, [language]));
  } catch (error) {
    return {
      files: await listSubtitleFiles(tmpDir),
      error: error instanceof Error ? error.message : String(error)
    };
  }
  return { files: await listSubtitleFiles(tmpDir) };
}

async function listSubtitleFiles(tmpDir: string): Promise<string[]> {
  const files = (await fs.readdir(tmpDir)).map((file) => path.join(tmpDir, file));
  return files.filter((file) => file.endsWith('.json3') || file.endsWith('.vtt'));
}

export function buildYouTubeInfoArgs(videoId: string): string[] {
  return [
    '--dump-single-json',
    '--skip-download',
    '--ignore-no-formats-error',
    ...YT_DLP_SHARED_ARGS,
    `https://www.youtube.com/watch?v=${videoId}`
  ];
}

export function buildYouTubeArchiveArgs(videoId: string, outputTemplate: string, subtitleLanguages: string[]): string[] {
  return [
    '--no-playlist',
    '--skip-download',
    '--ignore-no-formats-error',
    '--write-info-json',
    '--write-subs',
    '--write-auto-subs',
    '--sub-langs',
    normalizeSubtitleLanguages(subtitleLanguages).join(','),
    '--sub-format',
    'json3',
    ...YT_DLP_SHARED_ARGS,
    '-o',
    outputTemplate,
    `https://www.youtube.com/watch?v=${videoId}`
  ];
}

function buildYouTubeMarkdown(sourceType: YouTubeSourceType, archive: YouTubeVideoArchive): YouTubeMarkdownRecord {
  const info = archive.info;
  const videoId = stringValue(info.id) ?? 'unknown_video';
  const title = stringValue(info.title) ?? videoId;
  const videoUrl = stringValue(info.webpage_url) ?? `https://www.youtube.com/watch?v=${videoId}`;
  const channelName = stringValue(info.channel) ?? stringValue(info.uploader) ?? stringValue(info.channel_id);
  const description = stringValue(info.description) ?? '';
  const transcript = archive.subtitle_tracks.find((track) => track.language === archive.subtitle_language)?.transcript
    ?? subtitleToTranscript(archive.subtitle_content, archive.subtitle_format);
  const subtitleLanguages = archive.subtitle_tracks.map((track) => track.language);
  const durationSeconds = numberValue(info.duration);
  const metadata: FeedYouTubeMetadata = {
    provider: 'youtube',
    external_id: videoId,
    source_type: sourceType,
    video_url: videoUrl,
    ...(stringValue(info.thumbnail) ? { thumbnail_url: stringValue(info.thumbnail) } : {}),
    ...(channelName ? { channel_name: channelName } : {}),
    ...(stringValue(info.channel_id) ? { channel_id: stringValue(info.channel_id) } : {}),
    ...(stringValue(info.uploader_id) ? { uploader_id: stringValue(info.uploader_id) } : {}),
    ...(stringValue(info.uploader_url) ? { uploader_url: stringValue(info.uploader_url) } : {}),
    ...(toIsoTimestamp(numberValue(info.timestamp)) ? { published_at: toIsoTimestamp(numberValue(info.timestamp)) } : {}),
    ...(toUploadDate(stringValue(info.upload_date)) ? { upload_date: toUploadDate(stringValue(info.upload_date)) } : {}),
    ...(durationSeconds !== undefined ? { duration_seconds: durationSeconds, duration_human: formatDuration(durationSeconds) } : {}),
    ...(numberValue(info.view_count) !== undefined ? { view_count: numberValue(info.view_count) } : {}),
    ...(numberValue(info.like_count) !== undefined ? { like_count: numberValue(info.like_count) } : {}),
    ...(stringValue(info.language) ? { language: stringValue(info.language) } : {}),
    ...(stringValue(info.availability) ? { availability: stringValue(info.availability) } : {}),
    has_transcript: transcript !== null,
    ...(archive.subtitle_format ? { subtitle_format: archive.subtitle_format } : {}),
    ...(archive.subtitle_language ? { subtitle_language: archive.subtitle_language } : {}),
    subtitle_status: archive.subtitle_status,
    subtitle_requested_languages: archive.subtitle_requested_languages,
    subtitle_available_languages: archive.subtitle_available_languages,
    automatic_caption_languages: archive.automatic_caption_languages,
    subtitle_track_count: archive.subtitle_tracks.length,
    subtitle_languages: subtitleLanguages,
    ...(archive.subtitle_download_errors?.length ? { subtitle_download_errors: archive.subtitle_download_errors } : {}),
    ...(archive.subtitle_tracks.length > 0 && archive.subtitle_language
      ? { preferred_transcript_track_id: transcriptTrackId('youtube', archive.subtitle_language, archive.subtitle_tracks.find((track) => track.language === archive.subtitle_language)?.source_kind ?? 'auto') }
      : {})
  };
  const tags = stringArray(info.tags);
  const categories = stringArray(info.categories);
  const markdown = [
    `# ${title}`,
    '',
    '## Video Summary',
    '',
    `- source_type: ${sourceType}`,
    `- video_url: ${videoUrl}`,
    `- video_id: ${videoId}`,
    `- channel_name: ${inlineValue(channelName)}`,
    `- channel_id: ${inlineValue(stringValue(info.channel_id))}`,
    `- uploader_id: ${inlineValue(stringValue(info.uploader_id))}`,
    `- uploader_url: ${inlineValue(stringValue(info.uploader_url))}`,
    `- published_at: ${inlineValue(metadata.published_at)}`,
    `- upload_date: ${inlineValue(metadata.upload_date)}`,
    `- duration: ${inlineValue(metadata.duration_human)}`,
    `- view_count: ${inlineValue(metadata.view_count)}`,
    `- like_count: ${inlineValue(metadata.like_count)}`,
    `- has_transcript: ${metadata.has_transcript}`,
    `- subtitle_status: ${inlineValue(metadata.subtitle_status)}`,
    `- subtitle_language: ${inlineValue(metadata.subtitle_language)}`,
    `- subtitle_requested_languages: ${metadata.subtitle_requested_languages?.join(', ') || '_none_'}`,
    `- subtitle_available_languages: ${metadata.subtitle_available_languages?.join(', ') || '_none_'}`,
    `- automatic_caption_languages: ${metadata.automatic_caption_languages?.join(', ') || '_none_'}`,
    `- subtitle_track_count: ${metadata.subtitle_track_count ?? 0}`,
    `- subtitle_languages: ${metadata.subtitle_languages?.join(', ') || '_none_'}`,
    `- subtitle_download_errors: ${metadata.subtitle_download_errors?.join(' | ') || '_none_'}`,
    `- language: ${inlineValue(metadata.language)}`,
    `- availability: ${inlineValue(metadata.availability)}`,
    `- tags: ${tags.length > 0 ? tags.join(', ') : '_none_'}`,
    `- categories: ${categories.length > 0 ? categories.join(', ') : '_none_'}`,
    '',
    '## Description',
    '',
    description || '_No description available._',
    '',
    '<!-- YOUTUBE_TRANSCRIPT_START -->',
    '## Transcript',
    '',
    transcript || '_No subtitles available._',
    '',
    '<!-- YOUTUBE_TRANSCRIPT_END -->',
    '',
    '## Transcript Tracks',
    '',
    ...(archive.subtitle_tracks.length
      ? archive.subtitle_tracks.flatMap((track) => [
          `### ${track.label}`,
          '',
          track.transcript || '_No transcript text parsed._',
          ''
        ])
      : ['_No transcript tracks captured._', '']),
    ''
  ].join('\n');

  return { markdown, metadata, transcript, description };
}

function subtitleToTranscript(content: string | null, format: YouTubeSubtitleFormat | null): string | null {
  if (!content) return null;
  return segmentsToTranscript(subtitleToSegments(content, format));
}

function subtitleToSegments(content: string, format: YouTubeSubtitleFormat | null): FeedTranscriptSegment[] {
  if (format === 'json3') return json3ToSegments(content);
  if (format === 'vtt') return vttToSegments(content);
  const json3 = json3ToSegments(content);
  return json3.length > 0 ? json3 : vttToSegments(content);
}

export function json3ToTranscript(json3Content: string): string | null {
  return segmentsToTranscript(json3ToSegments(json3Content));
}

export function json3ToSegments(json3Content: string): FeedTranscriptSegment[] {
  try {
    const parsed = JSON.parse(json3Content) as { events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }> };
    const events = Array.isArray(parsed.events) ? parsed.events : [];
    const segments: FeedTranscriptSegment[] = [];
    let previousText = '';
    let index = 0;
    for (const event of events) {
      const rawText = (event.segs ?? [])
        .map((segment) => segment.utf8 ?? '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      if (!rawText) continue;
      const text = incrementalText(previousText, rawText);
      previousText = rawText;
      if (!text) continue;
      const startMs = Math.max(0, event.tStartMs ?? 0);
      const endMs = startMs + Math.max(0, event.dDurationMs ?? 0);
      segments.push({
        id: `seg-${String(index).padStart(5, '0')}`,
        start_ms: startMs,
        end_ms: endMs,
        text
      });
      index += 1;
    }
    return segments;
  } catch {
    return [];
  }
}

export function vttToTranscript(vttContent: string): string | null {
  return segmentsToTranscript(vttToSegments(vttContent));
}

export function vttToSegments(vttContent: string): FeedTranscriptSegment[] {
  const lines = vttContent.replace(/\r/g, '').split('\n');
  const segments: FeedTranscriptSegment[] = [];
  let index = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]?.trim() ?? '';
    const timing = /(?<start>\d{2}:\d{2}:\d{2}(?:\.\d{3})?)\s+-->\s+(?<end>\d{2}:\d{2}:\d{2}(?:\.\d{3})?)/.exec(line);
    if (!timing?.groups) {
      i += 1;
      continue;
    }
    const text: string[] = [];
    i += 1;
    while (i < lines.length && lines[i].trim()) {
      text.push(lines[i].replace(/<[^>]+>/g, '').trim());
      i += 1;
    }
    const cleaned = text.join(' ').replace(/\s+/g, ' ').trim();
    if (cleaned) {
      segments.push({
        id: `seg-${String(index).padStart(5, '0')}`,
        start_ms: timestampToMs(timing.groups.start),
        end_ms: timestampToMs(timing.groups.end),
        text: cleaned
      });
      index += 1;
    }
    i += 1;
  }
  return segments;
}

function segmentsToTranscript(segments: FeedTranscriptSegment[]): string | null {
  if (segments.length === 0) return null;
  return segments.map((segment) => `${formatTimestamp(segment.start_ms)} --> ${formatTimestamp(segment.end_ms)}\n${segment.text}`).join('\n\n');
}

function incrementalText(previous: string, current: string): string {
  if (!previous || !current.startsWith(previous)) return current;
  return current.slice(previous.length).trim();
}

export function chooseSubtitleFile(files: string[], languagePriority: string[]): string | null {
  if (files.length === 0) return null;
  const scored = files.map((file) => {
    const filename = path.basename(file);
    const isAuto = /\.auto\./i.test(filename);
    const language = subtitleLanguageFromFilename(filename);
    return {
      file,
      score: subtitleLanguagePriorityScore(language, languagePriority) + (isAuto ? 1 : 0)
    };
  });
  scored.sort((a, b) => a.score - b.score || a.file.localeCompare(b.file));
  return scored[0]?.file ?? null;
}

export function subtitleLanguageFromFilename(filename: string): string | undefined {
  const base = path.basename(filename);
  const match = /\.([a-z]{2}(?:-[A-Za-z0-9]+)*)(?:\.auto)?\.(?:json3|vtt)$/i.exec(base);
  return match?.[1];
}

export function chooseFallbackSubtitleLanguage(
  manualLanguages: string[],
  automaticLanguages: string[],
  languagePriority: string[]
): string | null {
  const available = uniqueLanguages([...manualLanguages, ...automaticLanguages]);
  if (available.length === 0) return null;

  for (const preferred of languagePriority) {
    const exact = available.find((language) => language.toLowerCase() === preferred.toLowerCase());
    if (exact) return exact;
    const related = available.find((language) => languageMatchesPreference(language, preferred));
    if (related) return related;
  }

  const wantsChinese = languagePriority.some((language) => /^zh(?:-|$)/i.test(language));
  if (wantsChinese) {
    const chinese = available.find((language) => /^zh(?:-|$)/i.test(language));
    if (chinese) return chinese;
  }

  const wantsEnglish = languagePriority.some((language) => /^en(?:-|$)/i.test(language));
  if (wantsEnglish) {
    const english = available.find((language) => /^en(?:-|$)/i.test(language));
    if (english) return english;
  }

  return available[0] ?? null;
}

function subtitleLanguagePriorityScore(language: string | undefined, languagePriority: string[]): number {
  if (!language) return 10_000;
  const exactIndex = languagePriority.findIndex((item) => language.toLowerCase() === item.toLowerCase());
  if (exactIndex !== -1) return exactIndex * 10;
  const relatedIndex = languagePriority.findIndex((item) => languageMatchesPreference(language, item));
  return relatedIndex === -1 ? 10_000 : relatedIndex * 10 + 5;
}

function languageMatchesPreference(language: string, preference: string): boolean {
  const normalizedLanguage = language.toLowerCase();
  const normalizedPreference = preference.toLowerCase();
  return normalizedLanguage.startsWith(`${normalizedPreference}-`) || normalizedPreference.startsWith(`${normalizedLanguage}-`);
}

export function transcriptTrackId(source: 'youtube' | 'ai' | 'user', language: string, sourceKind: FeedTranscriptTrackSourceKind): string {
  return `${source}:${sourceKind}:${language}`;
}

function languageLabel(language: string): string {
  if (/^zh-hans/i.test(language)) return 'Chinese Simplified';
  if (/^zh-hant/i.test(language)) return 'Chinese Traditional';
  if (/^zh(?:-|$)/i.test(language)) return 'Chinese';
  if (/^en(?:-|$)/i.test(language)) return 'English';
  return language;
}

function subtitleLanguageKeys(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return uniqueLanguages(Object.keys(value));
}

function uniqueLanguages(values: string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && value.toLowerCase() !== 'live_chat')
    )
  ];
}

function normalizeSubtitleLanguages(value?: string[]): string[] {
  const clean = [...new Set((value?.length ? value : DEFAULT_SUBTITLE_LANGUAGES).map((item) => item.trim()).filter(Boolean))];
  return clean.length ? clean : DEFAULT_SUBTITLE_LANGUAGES;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function runYtDlp(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: ytDlpPathEnv(process.env.PATH) }
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(ytDlpErrorMessage(code, stdout, stderr)));
    });
  });
}

function ytDlpPathEnv(currentPath: string | undefined): string {
  const parts = [
    ...(currentPath?.split(':') ?? []),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ].filter(Boolean);
  return [...new Set(parts)].join(':');
}

function ytDlpErrorMessage(code: number | null, stdout: string, stderr: string): string {
  const combined = `${stderr}\n${stdout}`
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-12)
    .join('\n');
  return combined || `yt-dlp exited with code ${code ?? 'unknown'}`;
}

function isYtDlpRateLimitedError(value: string): boolean {
  return /429|too many requests|rate.?limit/i.test(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function toIsoTimestamp(seconds?: number): string | undefined {
  if (seconds === undefined) return undefined;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toUploadDate(value?: string): string | undefined {
  if (!value || !/^\d{8}$/.test(value)) return undefined;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function timestampToMs(value: string): number {
  const [timePart] = value.split('.');
  const parts = timePart.split(':').map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => Number.isNaN(part))) return 0;
  const [hours = 0, minutes = 0, seconds = 0] = parts.length === 3 ? parts : [0, parts[0] ?? 0, parts[1] ?? 0];
  const millis = Number.parseInt(value.split('.')[1] ?? '0', 10);
  return hours * 3_600_000 + minutes * 60_000 + seconds * 1000 + (Number.isNaN(millis) ? 0 : millis);
}

function stripMs(value: string): string {
  return value.replace(/\.\d{3}$/, '');
}

function inlineValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '_unknown_';
  return String(value);
}
