import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type {
  QuickCaptureSuggestDraftInput,
  QuickCaptureSuggestDraftResult,
  QuickCaptureSuggestion
} from '@shared/capture';

export type QuickCaptureDraftTrigger = 'typing' | 'paste' | 'drop' | 'attachment' | 'audio';

export interface QuickCapturePayload {
  content: string;
  files: File[];
  audioFile: File | null;
  audioDurationSec: number;
  acceptedSuggestions: QuickCaptureSuggestion[];
  suggestionResult: QuickCaptureSuggestDraftResult | null;
}

interface QuickCaptureModalProps {
  open: boolean;
  saving?: boolean;
  suggesting?: boolean;
  error?: string | null;
  suggestionResult?: QuickCaptureSuggestDraftResult | null;
  onDraftChange?(input: QuickCaptureSuggestDraftInput, trigger: QuickCaptureDraftTrigger): void;
  onAnalyzeNow?(): void;
  onSave(payload: QuickCapturePayload): void;
  onClose(): void;
}

export function QuickCaptureModal({
  open,
  saving = false,
  suggesting = false,
  error = null,
  suggestionResult = null,
  onDraftChange,
  onAnalyzeNow,
  onSave,
  onClose
}: QuickCaptureModalProps): JSX.Element | null {
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDurationSec, setAudioDurationSec] = useState(0);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number>(0);
  const draftTriggerRef = useRef<QuickCaptureDraftTrigger>('typing');

  useEffect(() => {
    if (!open) return;
    setContent('');
    setFiles([]);
    setRecording(false);
    setRecordingError(null);
    setAudioFile(null);
    setAudioDurationSec(0);
    setSelectedSuggestionIds([]);
    draftTriggerRef.current = 'typing';
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trigger = draftTriggerRef.current;
    onDraftChange?.({
      content,
      hasAudio: Boolean(audioFile),
      attachmentNames: files.map((file) => file.name)
    }, trigger);
    draftTriggerRef.current = 'typing';
  }, [audioFile, content, files, onDraftChange, open]);

  useEffect(() => {
    if (!suggestionResult) return;
    const valid = new Set(suggestionResult.suggestions.map((suggestion) => suggestion.id));
    setSelectedSuggestionIds((current) => current.filter((id) => valid.has(id)));
  }, [suggestionResult]);

  if (!open) return null;

  const suggestions = suggestionResult?.suggestions ?? [];
  const acceptedSuggestions = suggestions.filter((suggestion) => selectedSuggestionIds.includes(suggestion.id));
  const canSave = Boolean(content.trim() || files.length > 0 || audioFile);

  function save(): void {
    if (!canSave || saving) return;
    onSave({
      content: content.trim(),
      files,
      audioFile,
      audioDurationSec,
      acceptedSuggestions,
      suggestionResult
    });
  }

  function addFiles(nextFiles: File[], trigger: QuickCaptureDraftTrigger): void {
    if (nextFiles.length === 0) return;
    draftTriggerRef.current = trigger;
    setFiles((current) => [...current, ...nextFiles]);
  }

  async function startRecording(): Promise<void> {
    setRecordingError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setRecordingError('Voice recording is not supported in this environment.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const seconds = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));
        draftTriggerRef.current = 'audio';
        setAudioFile(new File([blob], `voice-note-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`, { type: blob.type }));
        setAudioDurationSec(seconds);
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
      };
      recorder.start();
      setRecording(true);
    } catch (caught) {
      setRecordingError((caught as Error).message);
    }
  }

  function stopRecording(): void {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
  }

  function toggleSuggestion(id: string): void {
    setSelectedSuggestionIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-950/30 px-4 backdrop-blur-sm">
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(Array.from(event.dataTransfer.files ?? []), 'drop');
        }}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div>
            <h2 className="text-sm font-semibold">Quick Capture</h2>
            <p className="text-xs text-neutral-500">Type, paste, drop files, or record voice · ⌘⇧I</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900">
            Esc
          </button>
        </div>

        <div className="space-y-4 p-4">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onPaste={() => {
              draftTriggerRef.current = 'paste';
            }}
            onKeyDown={(event) => {
              const mod = event.metaKey || event.ctrlKey;
              if (mod && event.key === 'Enter') {
                event.preventDefault();
                save();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
              }
            }}
            placeholder="Write what happened, paste a link, or leave this blank and attach files/voice."
            className="h-44 w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-900"
          />

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => addFiles(Array.from(event.currentTarget.files ?? []), 'attachment')}
            />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg border border-neutral-300 px-3 py-1.5 font-medium dark:border-neutral-700">
              Attach files
            </button>
            {!recording ? (
              <button type="button" onClick={() => void startRecording()} className="rounded-lg border border-rose-200 px-3 py-1.5 font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-200 dark:hover:bg-rose-950/30">
                Record voice
              </button>
            ) : (
              <button type="button" onClick={stopRecording} className="rounded-lg bg-rose-600 px-3 py-1.5 font-medium text-white hover:bg-rose-500">
                Stop recording
              </button>
            )}
            {files.length > 0 ? <span className="text-neutral-500">{files.length} file(s)</span> : null}
            {audioFile ? <span className="text-neutral-500">{audioDurationSec}s voice</span> : null}
            {recordingError ? <span className="text-red-600 dark:text-red-300">{recordingError}</span> : null}
          </div>

          <SuggestionStrip
            suggestions={suggestions}
            selectedIds={selectedSuggestionIds}
            suggesting={suggesting}
            tags={suggestionResult?.tags ?? []}
            onToggle={toggleSuggestion}
            onAnalyzeNow={onAnalyzeNow}
          />
          {error ? <p className="text-xs text-red-600 dark:text-red-300">{error}</p> : null}
        </div>

        <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <span className="text-xs text-neutral-500">
            Saves to Notes and appears on Timeline. Suggestions are optional.
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium dark:border-neutral-700">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!canSave || saving}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : acceptedSuggestions.length > 0 ? `Save Note + ${acceptedSuggestions.length}` : 'Save Note'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuggestionStrip({
  suggestions,
  selectedIds,
  suggesting,
  tags,
  onToggle,
  onAnalyzeNow
}: {
  suggestions: QuickCaptureSuggestion[];
  selectedIds: string[];
  suggesting: boolean;
  tags: string[];
  onToggle(id: string): void;
  onAnalyzeNow?(): void;
}): JSX.Element {
  const visibleTags = useMemo(() => tags.slice(0, 4), [tags]);
  if (suggestions.length === 0 && !suggesting && visibleTags.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
        <span>AI suggestions will appear after a pause.</span>
        {onAnalyzeNow ? <AnalyzeButton suggesting={suggesting} onAnalyzeNow={onAnalyzeNow} /> : null}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <span>Suggestions</span>
          {suggesting ? <span>thinking…</span> : null}
        </div>
        {onAnalyzeNow ? <AnalyzeButton suggesting={suggesting} onAnalyzeNow={onAnalyzeNow} /> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => {
          const active = selectedIds.includes(suggestion.id);
          return (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => onToggle(suggestion.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                active
                  ? 'border-sky-400 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-100'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:border-sky-300 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200'
              }`}
              title={suggestion.detail ?? suggestion.label}
            >
              {suggestion.label}
              {suggestion.risk === 'proposal' ? ' · proposal' : ''}
            </button>
          );
        })}
        {visibleTags.map((tag) => (
          <span key={tag} className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
            #{tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function AnalyzeButton({
  suggesting,
  onAnalyzeNow
}: {
  suggesting: boolean;
  onAnalyzeNow(): void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onAnalyzeNow}
      disabled={suggesting}
      aria-label="Analyze"
      title="Analyze now"
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:border-sky-300 hover:text-sky-700 disabled:cursor-wait disabled:opacity-60 dark:border-neutral-800 dark:hover:border-sky-700 dark:hover:text-sky-200"
    >
      <RefreshCw size={13} className={suggesting ? 'animate-spin' : ''} />
    </button>
  );
}
