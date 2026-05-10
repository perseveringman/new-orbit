import { useEffect, useRef, useState } from 'react';
import type { CaptureLinkKind } from '@shared/capture';

export type QuickCaptureMode = 'note' | 'link' | 'task';

export interface QuickCapturePayload {
  mode: QuickCaptureMode;
  content: string;
  tags: string[];
  specialKind: string | null;
  files: File[];
  audioFile: File | null;
  audioDurationSec: number;
  link: {
    url: string;
    title: string;
    kind: CaptureLinkKind;
    notes: string;
  };
  task: {
    title: string;
    details: string;
  };
}

interface QuickCaptureModalProps {
  open: boolean;
  saving?: boolean;
  error?: string | null;
  onSave(payload: QuickCapturePayload): void;
  onClose(): void;
}

export function QuickCaptureModal({ open, saving = false, error = null, onSave, onClose }: QuickCaptureModalProps): JSX.Element | null {
  const [mode, setMode] = useState<QuickCaptureMode>('note');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [specialKind, setSpecialKind] = useState<string>('none');
  const [files, setFiles] = useState<File[]>([]);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkKind, setLinkKind] = useState<CaptureLinkKind>('read_later');
  const [linkNotes, setLinkNotes] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDetails, setTaskDetails] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDurationSec, setAudioDurationSec] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number>(0);

  useEffect(() => {
    if (!open) return;
    setMode('note');
    setContent('');
    setTags('');
    setSpecialKind('none');
    setFiles([]);
    setLinkUrl('');
    setLinkTitle('');
    setLinkKind('read_later');
    setLinkNotes('');
    setTaskTitle('');
    setTaskDetails('');
    setRecording(false);
    setRecordingError(null);
    setAudioFile(null);
    setAudioDurationSec(0);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [open]);

  if (!open) return null;

  const tagList = parseTags(tags);
  const canSave =
    mode === 'note'
      ? Boolean(content.trim() || files.length > 0 || audioFile)
      : mode === 'link'
        ? Boolean(linkUrl.trim())
        : Boolean(taskTitle.trim());

  function save(): void {
    if (!canSave || saving) return;
    onSave({
      mode,
      content: content.trim(),
      tags: tagList,
      specialKind: specialKind === 'none' ? null : specialKind,
      files,
      audioFile,
      audioDurationSec,
      link: {
        url: linkUrl.trim(),
        title: linkTitle.trim(),
        kind: linkKind,
        notes: linkNotes.trim()
      },
      task: {
        title: taskTitle.trim(),
        details: taskDetails.trim()
      }
    });
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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-950/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div>
            <h2 className="text-sm font-semibold">Quick Capture</h2>
            <p className="text-xs text-neutral-500">Capture notes, links, tasks, files, and voice · ⌘⇧I</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900">
            Esc
          </button>
        </div>
        <div className="space-y-4 p-4">
          <div className="flex rounded-xl bg-neutral-100 p-1 text-xs font-medium dark:bg-neutral-900">
            <ModeButton label="Note" active={mode === 'note'} onClick={() => setMode('note')} />
            <ModeButton label="Link" active={mode === 'link'} onClick={() => setMode('link')} />
            <ModeButton label="Task" active={mode === 'task'} onClick={() => setMode('task')} />
          </div>

          {mode === 'note' && (
            <div className="space-y-3">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(event) => setContent(event.target.value)}
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
                placeholder="Capture a note like a memo. Use #tags in the note or tag field, attach files, or record voice."
                className="h-40 w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-900"
              />
              <div className="grid gap-3 md:grid-cols-2">
                <label className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                  <span className="font-medium">Upload files</span>
                  <input
                    type="file"
                    multiple
                    className="mt-2 block w-full text-xs"
                    onChange={(event) => setFiles(Array.from(event.currentTarget.files ?? []))}
                  />
                  {files.length > 0 && <span className="mt-1 block text-neutral-500">{files.length} file(s) ready</span>}
                </label>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="font-medium">Voice note</div>
                  <div className="mt-2 flex items-center gap-2">
                    {!recording ? (
                      <button type="button" onClick={() => void startRecording()} className="rounded-lg bg-rose-600 px-3 py-1.5 font-medium text-white hover:bg-rose-500">
                        Record voice
                      </button>
                    ) : (
                      <button type="button" onClick={stopRecording} className="rounded-lg bg-neutral-900 px-3 py-1.5 font-medium text-white dark:bg-neutral-100 dark:text-neutral-950">
                        Stop recording
                      </button>
                    )}
                    {audioFile && <span className="text-neutral-500">{audioDurationSec}s recorded</span>}
                  </div>
                  {recordingError && <p className="mt-2 text-red-600 dark:text-red-300">{recordingError}</p>}
                </div>
              </div>
              <select
                value={specialKind}
                onChange={(event) => setSpecialKind(event.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-950"
              >
                <option value="none">No special marker</option>
                <option value="insight">💡 Insight</option>
                <option value="breakthrough">🌟 Breakthrough</option>
                <option value="setback">💔 Setback</option>
                <option value="milestone">🏁 Milestone</option>
                <option value="gratitude">🙏 Gratitude</option>
                <option value="reflection">🪞 Reflection</option>
              </select>
            </div>
          )}

          {mode === 'link' && (
            <div className="space-y-3">
              <input
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="https://example.com"
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-900"
              />
              <input
                value={linkTitle}
                onChange={(event) => setLinkTitle(event.target.value)}
                placeholder="Optional title"
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-950"
              />
              <div className="grid gap-2 md:grid-cols-2">
                <label className={`rounded-xl border p-3 text-xs ${linkKind === 'bookmark' ? 'border-sky-400 bg-sky-50 dark:bg-sky-950/30' : 'border-neutral-200 dark:border-neutral-800'}`}>
                  <input type="radio" checked={linkKind === 'bookmark'} onChange={() => setLinkKind('bookmark')} className="mr-2" />
                  <span className="font-medium">Bookmark</span>
                  <p className="mt-1 text-neutral-500">Tool/site collection for repeated use.</p>
                </label>
                <label className={`rounded-xl border p-3 text-xs ${linkKind === 'read_later' ? 'border-sky-400 bg-sky-50 dark:bg-sky-950/30' : 'border-neutral-200 dark:border-neutral-800'}`}>
                  <input type="radio" checked={linkKind === 'read_later'} onChange={() => setLinkKind('read_later')} className="mr-2" />
                  <span className="font-medium">Read later</span>
                  <p className="mt-1 text-neutral-500">Convert directly into Library for reading/distilling.</p>
                </label>
              </div>
              <textarea
                value={linkNotes}
                onChange={(event) => setLinkNotes(event.target.value)}
                placeholder="Why is this useful?"
                className="h-24 w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-900"
              />
            </div>
          )}

          {mode === 'task' && (
            <div className="space-y-3">
              <input
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="Task title"
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-900"
              />
              <textarea
                value={taskDetails}
                onChange={(event) => setTaskDetails(event.target.value)}
                placeholder="Details, acceptance notes, or context. This goes to Inbox for project assignment."
                className="h-28 w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-900"
              />
            </div>
          )}

          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="tags, comma separated"
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-950"
          />
          {error && <p className="text-xs text-red-600 dark:text-red-300">{error}</p>}
        </div>
        <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <span className="text-xs text-neutral-500">
            {mode === 'task' ? 'Tasks enter Inbox first.' : mode === 'link' ? 'Bookmarks/read-later save to Library.' : 'Notes save with attachments and tags.'}
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
              {saving ? 'Saving…' : mode === 'task' ? 'Send to Inbox' : mode === 'link' ? 'Save Link' : 'Save Note'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeButton({ label, active, onClick }: { label: string; active: boolean; onClick(): void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-1.5 ${
        active
          ? 'bg-white text-neutral-950 shadow-sm dark:bg-neutral-800 dark:text-neutral-50'
          : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
      }`}
    >
      {label}
    </button>
  );
}

function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean);
}
