import { useEffect, useState } from 'react';
import type { QuickCaptureSuggestDraftInput, QuickCaptureSuggestDraftResult, QuickCaptureSuggestion } from '@shared/capture';
import { useFiles } from '../../store/files';
import { QuickCaptureModal, type QuickCapturePayload } from './QuickCaptureModal';

export function QuickCaptureProvider(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [draft, setDraft] = useState<QuickCaptureSuggestDraftInput>({ content: '' });
  const [suggestionResult, setSuggestionResult] = useState<QuickCaptureSuggestDraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useFiles((state) => state.toast);

  useEffect(() => {
    return window.orbit.quickCapture.onOpen(() => {
      setError(null);
      setOpen(true);
    });
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.shiftKey && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        setError(null);
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const hasSignal = draft.content.trim() || draft.hasAudio || (draft.attachmentNames?.length ?? 0) > 0;
    if (!hasSignal) {
      setSuggestionResult(null);
      setSuggesting(false);
      return;
    }
    let cancelled = false;
    setSuggesting(true);
    const timer = window.setTimeout(() => {
      void window.orbit.capture.quick
        .suggestDraft(draft)
        .then((result) => {
          if (!cancelled) setSuggestionResult(result);
        })
        .catch(() => {
          if (!cancelled) setSuggestionResult(null);
        })
        .finally(() => {
          if (!cancelled) setSuggesting(false);
        });
    }, 420);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft, open]);

  async function save(payload: QuickCapturePayload): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const tags = payload.suggestionResult?.tags ?? [];
      const sourceUrl = sourceUrlFromSuggestions(payload.acceptedSuggestions) ?? firstUrl(payload.content);
      await window.orbit.capture.quick.createNote({
        content: payload.content,
        tags,
        attachments: await Promise.all(payload.files.map((file) => attachmentInput(file, 'file'))),
        sourceUrl,
        sourceTitle: payload.suggestionResult?.title,
        acceptedSuggestionActions: payload.acceptedSuggestions.map((suggestion) => suggestion.action),
        ...(payload.audioFile
          ? {
              audio: {
                ...(await attachmentInput(payload.audioFile, 'audio')),
                durationSec: payload.audioDurationSec
              }
            }
          : {})
      });
      await applyAcceptedSuggestions(payload.acceptedSuggestions, payload.content, tags);
      toast(payload.acceptedSuggestions.length > 0 ? `Note captured + ${payload.acceptedSuggestions.length} action(s)` : 'Note captured to Timeline');
      setOpen(false);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <QuickCaptureModal
      open={open}
      saving={saving}
      suggesting={suggesting}
      error={error}
      suggestionResult={suggestionResult}
      onDraftChange={setDraft}
      onSave={(payload) => void save(payload)}
      onClose={() => setOpen(false)}
    />
  );
}

async function applyAcceptedSuggestions(suggestions: QuickCaptureSuggestion[], content: string, tags: string[]): Promise<void> {
  for (const suggestion of suggestions) {
    if (suggestion.action === 'save_to_library' || suggestion.action === 'bookmark') {
      const url = stringParam(suggestion, 'url') ?? firstUrl(content);
      if (!url) continue;
      await window.orbit.capture.quick.createLink({
        url,
        kind: suggestion.action === 'bookmark' ? 'bookmark' : 'read_later',
        title: stringParam(suggestion, 'title'),
        notes: content,
        tags
      });
    } else if (suggestion.action === 'create_task') {
      await window.orbit.capture.quick.createTask({
        title: stringParam(suggestion, 'title') ?? titleFromContent(content),
        details: stringParam(suggestion, 'details') ?? content,
        tags
      });
    }
  }
}

async function attachmentInput(file: File, kind: 'file' | 'audio'): Promise<{ name: string; dataBase64: string; mimeType?: string; kind: 'file' | 'audio' }> {
  return {
    name: file.name,
    dataBase64: await fileToBase64(file),
    ...(file.type ? { mimeType: file.type } : {}),
    kind
  };
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? '').split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('failed to read file'));
    reader.readAsDataURL(file);
  });
}

function sourceUrlFromSuggestions(suggestions: QuickCaptureSuggestion[]): string | undefined {
  for (const suggestion of suggestions) {
    const url = stringParam(suggestion, 'url');
    if (url) return url;
  }
  return undefined;
}

function stringParam(suggestion: QuickCaptureSuggestion, key: string): string | undefined {
  const value = suggestion.params?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function firstUrl(value: string): string | undefined {
  const match = value.match(/https?:\/\/[^\s)]+|(?:^|\s)([a-z0-9.-]+\.[a-z]{2,})(?:\/[^\s)]*)?/i);
  const raw = match?.[0]?.trim() || match?.[1]?.trim();
  if (!raw) return undefined;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function titleFromContent(value: string): string {
  return value.trim().split(/\r?\n/)[0]?.replace(/^(todo|task|待办)[:：]\s*/i, '').slice(0, 80) || 'Captured task';
}
