import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { QuickCaptureSuggestDraftInput, QuickCaptureSuggestDraftResult, QuickCaptureSuggestion } from '@shared/capture';
import {
  quickCaptureActionDetail,
  quickCaptureActionLabel,
  quickCaptureActionTag,
  quickCaptureSuggestionStableId
} from '@shared/quick-capture-actions';
import { useFiles } from '../../store/files';
import { usePara } from '../../store/para';
import { useWorkspace } from '../../store/workspace';
import { QUICK_CAPTURE_OPEN_EVENT } from './events';
import {
  QuickCaptureModal,
  type QuickCaptureDraftTrigger,
  type QuickCapturePayload,
  type QuickCaptureSaveResult
} from './QuickCaptureModal';

const TYPING_ANALYZE_DELAY_MS = 1500;
const EVENT_ANALYZE_DELAY_MS = 500;
const MIN_AI_CONTENT_CHARS = 12;
const MEANINGFUL_DELTA_CHARS = 40;
const REANALYZE_COOLDOWN_MS = 5000;

export function QuickCaptureProvider(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionResult, setSuggestionResult] = useState<QuickCaptureSuggestDraftResult | null>(null);
  const [saveResult, setSaveResult] = useState<QuickCaptureSaveResult | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const analyzeTimerRef = useRef<number | null>(null);
  const analyzeSeqRef = useRef(0);
  const latestDraftRef = useRef<QuickCaptureSuggestDraftInput>({ content: '' });
  const lastAiAnalysisRef = useRef<{ signature: string; content: string; at: number } | null>(null);
  const toast = useFiles((state) => state.toast);
  const openPath = useFiles((state) => state.openPath);
  const vaultPath = useWorkspace((state) => state.vault?.path ?? null);
  const resolvedTheme = useWorkspace((state) => state.resolvedTheme);
  const projects = useWorkspace((state) => state.projects);
  const refreshProjects = useWorkspace((state) => state.refreshProjects);
  const setView = usePara((state) => state.setView);

  const openCapture = useCallback(() => {
    clearAnalyzeTimer(analyzeTimerRef);
    analyzeSeqRef.current += 1;
    latestDraftRef.current = { content: '' };
    lastAiAnalysisRef.current = null;
    setSuggestionResult(null);
    setSaveResult(null);
    setSuggesting(false);
    setError(null);
    setResetKey((value) => value + 1);
    setOpen(true);
  }, []);

  useEffect(() => {
    return window.orbit.quickCapture.onOpen(openCapture);
  }, [openCapture]);

  useEffect(() => {
    function onOpenFromRenderer(): void {
      openCapture();
    }

    window.addEventListener(QUICK_CAPTURE_OPEN_EVENT, onOpenFromRenderer);
    return () => window.removeEventListener(QUICK_CAPTURE_OPEN_EVENT, onOpenFromRenderer);
  }, [openCapture]);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.shiftKey && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        openCapture();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openCapture]);

  useEffect(() => {
    if (open) return undefined;
    clearAnalyzeTimer(analyzeTimerRef);
    analyzeSeqRef.current += 1;
    setSuggesting(false);
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open || projects.length > 0) return;
    void refreshProjects();
  }, [open, projects.length, refreshProjects]);

  useEffect(() => {
    return () => {
      clearAnalyzeTimer(analyzeTimerRef);
      analyzeSeqRef.current += 1;
    };
  }, []);

  async function runAiAnalysis(
    nextDraft: QuickCaptureSuggestDraftInput,
    force = false,
    trigger: QuickCaptureDraftTrigger = 'typing'
  ): Promise<void> {
    clearAnalyzeTimer(analyzeTimerRef);
    if (!force && !shouldRunAiAnalysis(nextDraft, trigger, lastAiAnalysisRef.current)) return;
    if (force && !hasDraftSignal(nextDraft)) return;
    const seq = analyzeSeqRef.current + 1;
    analyzeSeqRef.current = seq;
    setSuggesting(true);
    try {
      const result = await window.orbit.capture.quick.suggestDraft(nextDraft);
      if (analyzeSeqRef.current !== seq) return;
      setSuggestionResult(result);
      lastAiAnalysisRef.current = {
        signature: draftSignature(nextDraft),
        content: nextDraft.content.trim(),
        at: Date.now()
      };
    } catch {
      if (analyzeSeqRef.current === seq) {
        setSuggestionResult(localHeuristicSuggestions(nextDraft));
      }
    } finally {
      if (analyzeSeqRef.current === seq) setSuggesting(false);
    }
  }

  const handleDraftChange = useCallback((nextDraft: QuickCaptureSuggestDraftInput, trigger: QuickCaptureDraftTrigger = 'typing') => {
    clearAnalyzeTimer(analyzeTimerRef);
    analyzeSeqRef.current += 1;
    latestDraftRef.current = nextDraft;
    setSuggestionResult(localHeuristicSuggestions(nextDraft));

    if (!open || !shouldRunAiAnalysis(nextDraft, trigger, lastAiAnalysisRef.current)) {
      setSuggesting(false);
      return;
    }

    const delay = trigger === 'typing' ? TYPING_ANALYZE_DELAY_MS : EVENT_ANALYZE_DELAY_MS;
    analyzeTimerRef.current = window.setTimeout(() => {
      void runAiAnalysis(nextDraft, false, trigger);
    }, delay);
  }, [open]);

  const analyzeNow = useCallback(() => {
    void runAiAnalysis(latestDraftRef.current, true);
  }, []);

  async function save(payload: QuickCapturePayload): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const markers = markerTagsForSuggestions(payload.acceptedSuggestions);
      const tags = uniqueTags([...(payload.suggestionResult?.tags ?? []), ...markers]);
      const sourceUrl = sourceUrlFromSuggestions(payload.acceptedSuggestions) ?? firstUrl(payload.content);
      const noteResult = await window.orbit.capture.quick.createNote({
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
      const actionResult = await applyAcceptedSuggestions(payload.acceptedSuggestions, payload.content, tags);
      const result: QuickCaptureSaveResult = {
        note: {
          id: noteResult.note.frontmatter.id,
          title: noteResult.note.frontmatter.title ?? noteResult.note.path,
          path: noteResult.note.path
        },
        libraryItems: actionResult.libraryItems,
        inboxItems: actionResult.inboxItems,
        markers,
        warnings: actionResult.warnings
      };
      setSaveResult(result);
      toast(summaryForResult(result));
      clearAnalyzeTimer(analyzeTimerRef);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function openSavedNote(): Promise<void> {
    if (!saveResult || !vaultPath) return;
    await openPath(joinVaultPath(vaultPath, saveResult.note.path));
    setView({ kind: 'editor' });
    setOpen(false);
  }

  function continueCapture(): void {
    setSaveResult(null);
    setSuggestionResult(null);
    setError(null);
    setResetKey((value) => value + 1);
  }

  return (
    <QuickCaptureModal
      open={open}
      saving={saving}
      suggesting={suggesting}
      error={error}
      suggestionResult={suggestionResult}
      saveResult={saveResult}
      resetKey={resetKey}
      dark={resolvedTheme === 'dark'}
      vaultRoot={vaultPath}
      projects={projects}
      onDraftChange={handleDraftChange}
      onAnalyzeNow={analyzeNow}
      onSave={(payload) => void save(payload)}
      onContinue={continueCapture}
      onOpenNote={() => void openSavedNote()}
      onOpenLibrary={() => {
        setView({ kind: 'library' });
        setOpen(false);
      }}
      onOpenInbox={() => {
        setView({ kind: 'inbox' });
        setOpen(false);
      }}
      onClose={() => setOpen(false)}
    />
  );
}

function clearAnalyzeTimer(ref: MutableRefObject<number | null>): void {
  if (ref.current !== null) {
    window.clearTimeout(ref.current);
    ref.current = null;
  }
}

function shouldRunAiAnalysis(
  nextDraft: QuickCaptureSuggestDraftInput,
  trigger: QuickCaptureDraftTrigger,
  last: { signature: string; content: string; at: number } | null
): boolean {
  if (!hasDraftSignal(nextDraft)) return false;
  const content = nextDraft.content.trim();
  const hasRichInput = Boolean(nextDraft.hasAudio || (nextDraft.attachmentNames?.length ?? 0) > 0);
  if (!hasRichInput && content.length < MIN_AI_CONTENT_CHARS) return false;
  if (!last) return true;
  const signature = draftSignature(nextDraft);
  if (signature === last.signature) return false;
  if (trigger !== 'typing') return true;
  const delta = contentDelta(content, last.content);
  return delta >= MEANINGFUL_DELTA_CHARS || Date.now() - last.at >= REANALYZE_COOLDOWN_MS;
}

function hasDraftSignal(input: QuickCaptureSuggestDraftInput): boolean {
  return Boolean(input.content.trim() || input.hasAudio || (input.attachmentNames?.length ?? 0) > 0);
}

function draftSignature(input: QuickCaptureSuggestDraftInput): string {
  return JSON.stringify({
    content: input.content.trim(),
    hasAudio: Boolean(input.hasAudio),
    attachmentNames: input.attachmentNames ?? []
  });
}

function contentDelta(a: string, b: string): number {
  if (a === b) return 0;
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix + prefix < a.length &&
    suffix + prefix < b.length &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return Math.max(a.length - prefix - suffix, b.length - prefix - suffix);
}

function localHeuristicSuggestions(input: QuickCaptureSuggestDraftInput): QuickCaptureSuggestDraftResult | null {
  if (!hasDraftSignal(input)) return null;
  const content = input.content.trim();
  const suggestions: QuickCaptureSuggestion[] = [];
  const url = firstUrl(content);
  if (url) {
    const host = safeHostname(url);
    suggestions.push({
      id: quickCaptureSuggestionStableId('save_to_library', { url }),
      action: 'save_to_library',
      label: quickCaptureActionLabel('save_to_library'),
      detail: host,
      confidence: 0.88,
      risk: 'low',
      params: { url },
      source: 'heuristic'
    });
    suggestions.push({
      id: quickCaptureSuggestionStableId('bookmark', { url }),
      action: 'bookmark',
      label: quickCaptureActionLabel('bookmark'),
      detail: quickCaptureActionDetail('bookmark'),
      confidence: 0.62,
      risk: 'low',
      params: { url },
      source: 'heuristic'
    });
  }
  if (looksActionable(content)) {
    suggestions.push({
      id: quickCaptureSuggestionStableId('create_task'),
      action: 'create_task',
      label: quickCaptureActionLabel('create_task'),
      detail: titleFromContent(content),
      confidence: 0.74,
      risk: 'proposal',
      params: { title: titleFromContent(content), details: content },
      source: 'heuristic'
    });
  }
  if (input.hasAudio) {
    suggestions.push({
      id: quickCaptureSuggestionStableId('transcribe_voice'),
      action: 'transcribe_voice',
      label: quickCaptureActionLabel('transcribe_voice'),
      detail: quickCaptureActionDetail('transcribe_voice'),
      confidence: 0.72,
      risk: 'needs_confirm',
      source: 'heuristic'
    });
  }
  if (content.length > 800) {
    suggestions.push({
      id: quickCaptureSuggestionStableId('distill_later'),
      action: 'distill_later',
      label: quickCaptureActionLabel('distill_later'),
      detail: quickCaptureActionDetail('distill_later'),
      confidence: 0.65,
      risk: 'needs_confirm',
      source: 'heuristic'
    });
  }
  return {
    title: titleFromDraft(content, input.attachmentNames ?? []),
    tags: extractHashTags(content),
    suggestions,
    source: 'heuristic'
  };
}

function extractHashTags(value: string): string[] {
  return Array.from(value.matchAll(/(?:^|\s)#([a-zA-Z0-9_\-\u4e00-\u9fff]+)/g), (match) => match[1] ?? '')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function looksActionable(value: string): boolean {
  return /\b(todo|fix|ship|write|call|email|review|implement|follow up|remind|need to|should|must)\b/i.test(value)
    || /(?:^|\s)(要|需要|记得|待办|修复|实现|跟进|提醒|创建|整理)(?:\s|$)/.test(value);
}

function titleFromDraft(content: string, attachmentNames: string[]): string | undefined {
  if (content) return titleFromContent(content);
  if (attachmentNames.length > 0) return `已捕获 ${attachmentNames.length} 个文件`;
  return undefined;
}

async function applyAcceptedSuggestions(
  suggestions: QuickCaptureSuggestion[],
  content: string,
  tags: string[]
): Promise<{
  libraryItems: QuickCaptureSaveResult['libraryItems'];
  inboxItems: QuickCaptureSaveResult['inboxItems'];
  warnings: string[];
}> {
  const libraryItems: QuickCaptureSaveResult['libraryItems'] = [];
  const inboxItems: QuickCaptureSaveResult['inboxItems'] = [];
  const warnings: string[] = [];
  for (const suggestion of suggestions) {
    try {
      if (suggestion.action === 'save_to_library' || suggestion.action === 'bookmark') {
        const url = stringParam(suggestion, 'url') ?? firstUrl(content);
        if (!url) {
          warnings.push(`${quickCaptureActionLabel(suggestion.action)}缺少链接，已跳过。`);
          continue;
        }
        const result = await window.orbit.capture.quick.createLink({
          url,
          kind: suggestion.action === 'bookmark' ? 'bookmark' : 'read_later',
          title: stringParam(suggestion, 'title'),
          notes: content,
          tags
        });
        libraryItems.push({
          id: result.item.frontmatter.id,
          title: result.item.frontmatter.title,
          kind: result.item.frontmatter.kind
        });
      } else if (suggestion.action === 'create_task') {
        const result = await window.orbit.capture.quick.createTask({
          title: stringParam(suggestion, 'title') ?? titleFromContent(content),
          details: stringParam(suggestion, 'details') ?? content,
          tags
        });
        inboxItems.push({
          id: result.item.id,
          title: result.item.title
        });
      }
    } catch (caught) {
      warnings.push(`${quickCaptureActionLabel(suggestion.action)}失败：${(caught as Error).message}`);
    }
  }
  return { libraryItems, inboxItems, warnings };
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
  return value.trim().split(/\r?\n/)[0]?.replace(/^(todo|task|待办)[:：]\s*/i, '').slice(0, 48) || '已捕获任务';
}

function safeHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function markerTagsForSuggestions(suggestions: QuickCaptureSuggestion[]): string[] {
  return uniqueTags(
    suggestions
      .map((suggestion) => quickCaptureActionTag(suggestion.action))
      .filter((tag): tag is string => Boolean(tag))
  );
}

function uniqueTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean))];
}

function summaryForResult(result: QuickCaptureSaveResult): string {
  const parts = ['笔记已捕获'];
  if (result.libraryItems.length > 0) parts.push(`${result.libraryItems.length} 个资料库条目`);
  if (result.inboxItems.length > 0) parts.push(`${result.inboxItems.length} 个收件箱任务`);
  if (result.markers.length > 0) parts.push(`${result.markers.length} 个后续标记`);
  if (result.warnings.length > 0) parts.push(`${result.warnings.length} 个行动需重试`);
  return parts.join(' + ');
}

function joinVaultPath(vaultPath: string, relPath: string): string {
  const separator = vaultPath.includes('\\') ? '\\' : '/';
  return `${vaultPath.replace(/[\\/]+$/, '')}${separator}${relPath.replace(/\//g, separator)}`;
}
