import { describe, expect, it } from 'vitest';
import {
  buildYouTubeArchiveArgs,
  buildYouTubeInfoArgs,
  chooseFallbackSubtitleLanguage,
  chooseSubtitleFile,
  json3ToSegments,
  json3ToTranscript,
  normalizeYouTubeSource,
  subtitleLanguageFromFilename,
  vttToTranscript
} from '../src/main/feed/youtube';

describe('YouTube feed provider helpers', () => {
  it('normalizes common YouTube source shapes', () => {
    expect(normalizeYouTubeSource('@orbit')).toEqual({
      url: 'https://www.youtube.com/@orbit/videos',
      source_type: 'channel'
    });
    expect(normalizeYouTubeSource('https://youtu.be/abc123?t=12')).toEqual({
      url: 'https://www.youtube.com/watch?v=abc123',
      source_type: 'video'
    });
    expect(normalizeYouTubeSource('https://www.youtube.com/shorts/xyz987')).toEqual({
      url: 'https://www.youtube.com/watch?v=xyz987',
      source_type: 'video'
    });
    expect(normalizeYouTubeSource('https://www.youtube.com/playlist?list=PL123')).toEqual({
      url: 'https://www.youtube.com/playlist?list=PL123',
      source_type: 'playlist'
    });
  });

  it('converts subtitle payloads into timestamped transcript text', () => {
    expect(
      json3ToTranscript(
        JSON.stringify({
          events: [
            { tStartMs: 0, dDurationMs: 1200, segs: [{ utf8: 'hello' }] },
            { tStartMs: 1200, dDurationMs: 1000, segs: [{ utf8: 'hello world' }] }
          ]
        })
      )
    ).toContain('00:00:01 --> 00:00:02\nworld');
    expect(
      json3ToSegments(
        JSON.stringify({
          events: [
            { tStartMs: 0, dDurationMs: 1200, segs: [{ utf8: 'hello' }] },
            { tStartMs: 1200, dDurationMs: 1000, segs: [{ utf8: 'hello world' }] }
          ]
        })
      )
    ).toEqual([
      { id: 'seg-00000', start_ms: 0, end_ms: 1200, text: 'hello' },
      { id: 'seg-00001', start_ms: 1200, end_ms: 2200, text: 'world' }
    ]);
    expect(
      vttToTranscript(`WEBVTT

00:00:01.000 --> 00:00:02.000
hello <b>orbit</b>
`)
    ).toContain('00:00:01 --> 00:00:02\nhello orbit');
  });

  it('builds yt-dlp archive args with cookies and auto captions enabled', () => {
    const infoArgs = buildYouTubeInfoArgs('abc123');
    expect(infoArgs).toContain('--dump-single-json');
    expect(infoArgs).toContain('--ignore-no-formats-error');

    const args = buildYouTubeArchiveArgs('abc123', '/tmp/abc123.%(ext)s', ['zh-Hans', 'en']);
    expect(args).toContain('--write-auto-subs');
    expect(args).toContain('--cookies-from-browser');
    expect(args).toContain('--ignore-no-formats-error');
    expect(args).toContain('--write-info-json');
    expect(args.slice(args.indexOf('--cookies-from-browser'), args.indexOf('--cookies-from-browser') + 2)).toEqual([
      '--cookies-from-browser',
      'chrome'
    ]);
    expect(args.filter((arg) => arg === '--sub-format')).toHaveLength(1);
    expect(args.slice(args.indexOf('--sub-format'), args.indexOf('--sub-format') + 2)).toEqual(['--sub-format', 'json3/vtt/best']);

    const defaultArgs = buildYouTubeArchiveArgs('abc123', '/tmp/abc123.%(ext)s', []);
    expect(defaultArgs.slice(defaultArgs.indexOf('--sub-langs'), defaultArgs.indexOf('--sub-langs') + 2)).toEqual([
      '--sub-langs',
      'zh.*,en.*'
    ]);
  });

  it('selects subtitle languages by requested language before manual-vs-auto preference', () => {
    expect(subtitleLanguageFromFilename('/tmp/video.zh-Hans-en.json3')).toBe('zh-Hans-en');
    expect(chooseSubtitleFile(['/tmp/video.fr.json3', '/tmp/video.zh-Hans.auto.json3'], ['zh-Hans', 'en'])).toBe(
      '/tmp/video.zh-Hans.auto.json3'
    );
    expect(chooseFallbackSubtitleLanguage([], ['zh-Hant', 'en'], ['zh-Hans', 'zh', 'en'])).toBe('zh-Hant');
    expect(chooseFallbackSubtitleLanguage([], ['en-GB', 'zh-Hans-en-GB'], ['zh.*', 'en.*'])).toBe('zh-Hans-en-GB');
  });
});
