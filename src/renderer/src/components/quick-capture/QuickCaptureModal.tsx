import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Inbox,
  Library,
  Mic,
  Paperclip,
  RefreshCw,
  RotateCcw,
  Save,
  X
} from 'lucide-react';
import type {
  QuickCaptureSuggestDraftInput,
  QuickCaptureSuggestDraftResult,
  QuickCaptureSuggestion
} from '@shared/capture';
import type { ProjectSummaryDTO } from '@shared/ipc';
import {
  quickCaptureActionDetail,
  quickCaptureActionLabel,
  quickCaptureSuggestionStableId
} from '@shared/quick-capture-actions';
import {
  MarkdownLiveEditor,
  type MarkdownLiveEditorKeyCommand,
  type MarkdownLiveEditorHandle
} from '../Editor/MarkdownLiveEditor';

export type QuickCaptureDraftTrigger = 'typing' | 'paste' | 'drop' | 'attachment' | 'audio';

export interface QuickCapturePayload {
  content: string;
  files: File[];
  audioFile: File | null;
  audioDurationSec: number;
  acceptedSuggestions: QuickCaptureSuggestion[];
  suggestionResult: QuickCaptureSuggestDraftResult | null;
}

export interface QuickCaptureSaveResult {
  note: {
    id: string;
    title: string;
    path: string;
  };
  libraryItems: Array<{
    id: string;
    title: string;
    kind: string;
  }>;
  inboxItems: Array<{
    id: string;
    title: string;
  }>;
  markers: string[];
  warnings: string[];
}

type QuickCaptureCommandId =
  | 'task'
  | 'idea'
  | 'event'
  | 'tag'
  | 'project'
  | 'attachment'
  | 'voice'
  | 'analyze'
  | 'save';

interface QuickCaptureCommand {
  id: QuickCaptureCommandId;
  glyph?: string;
  icon?: JSX.Element;
  label: string;
  description: string;
  shortcut?: string;
  disabled?: boolean;
}

interface QuickCaptureModalProps {
  open: boolean;
  saving?: boolean;
  suggesting?: boolean;
  error?: string | null;
  suggestionResult?: QuickCaptureSuggestDraftResult | null;
  saveResult?: QuickCaptureSaveResult | null;
  resetKey?: number;
  dark?: boolean;
  vaultRoot?: string | null;
  projects?: ProjectSummaryDTO[];
  onDraftChange?(input: QuickCaptureSuggestDraftInput, trigger: QuickCaptureDraftTrigger): void;
  onAnalyzeNow?(): void;
  onSave(payload: QuickCapturePayload): void;
  onContinue?(): void;
  onOpenNote?(): void;
  onOpenLibrary?(): void;
  onOpenInbox?(): void;
  onClose(): void;
}

export function QuickCaptureModal({
  open,
  saving = false,
  suggesting = false,
  error = null,
  suggestionResult = null,
  saveResult = null,
  resetKey = 0,
  dark = false,
  vaultRoot = null,
  projects = [],
  onDraftChange,
  onAnalyzeNow,
  onSave,
  onContinue,
  onOpenNote,
  onOpenLibrary,
  onOpenInbox,
  onClose
}: QuickCaptureModalProps): JSX.Element | null {
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [recordingState, setRecordingState] = useState<'idle' | 'requesting' | 'recording'>('idle');
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDurationSec, setAudioDurationSec] = useState(0);
  const [selectedSuggestionKeys, setSelectedSuggestionKeys] = useState<string[]>([]);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const editorRef = useRef<MarkdownLiveEditorHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number>(0);
  const draftTriggerRef = useRef<QuickCaptureDraftTrigger>('typing');

  useEffect(() => {
    if (!open) return;
    setContent('');
    setFiles([]);
    setRecordingState('idle');
    setRecordingError(null);
    setAudioFile(null);
    setAudioDurationSec(0);
    setSelectedSuggestionKeys([]);
    setProjectPickerOpen(false);
    setSlashOpen(false);
    setSlashIndex(0);
    draftTriggerRef.current = 'typing';
    window.setTimeout(() => editorRef.current?.focus(), 0);
  }, [open, resetKey]);

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

  const suggestions = suggestionResult?.suggestions ?? [];
  const acceptedSuggestions = suggestions.filter((suggestion) =>
    selectedSuggestionKeys.includes(suggestionKey(suggestion))
  );
  const canSave = Boolean(content.trim() || files.length > 0 || audioFile);
  const quickCommands = useMemo<QuickCaptureCommand[]>(
    () => [
      { id: 'task', glyph: '•', label: '任务', description: '把当前行设为行动候选', shortcut: '⌘1' },
      { id: 'idea', glyph: '-', label: '想法', description: '把当前行设为想法/笔记', shortcut: '⌘2' },
      { id: 'event', glyph: '○', label: '事件', description: '把当前行设为事件/时间安排', shortcut: '⌘3' },
      { id: 'tag', glyph: '#', label: '标签', description: '插入 #tag', shortcut: '⌘4' },
      { id: 'project', glyph: '@', label: '项目', description: '关联一个项目', shortcut: '⌘5' },
      { id: 'attachment', icon: <Paperclip size={13} />, label: '附件', description: '添加文件', shortcut: '⌘6' },
      {
        id: 'voice',
        icon: <Mic size={13} />,
        label: recordingState === 'recording' ? '停止语音' : '语音',
        description: recordingState === 'recording' ? '停止录音' : '开始录音',
        shortcut: '⌘7',
        disabled: recordingState === 'requesting'
      },
      {
        id: 'analyze',
        icon: <RefreshCw size={13} className={suggesting ? 'animate-spin' : ''} />,
        label: '分析',
        description: '立即生成 AI 建议',
        shortcut: '⌘K',
        disabled: suggesting || !onAnalyzeNow
      },
      {
        id: 'save',
        icon: <Save size={13} />,
        label: saving ? '保存中' : acceptedSuggestions.length > 0 ? `保存 + ${acceptedSuggestions.length}` : '保存',
        description: '保存快速捕获',
        shortcut: '⌘Enter',
        disabled: !canSave || saving
      }
    ],
    [acceptedSuggestions.length, canSave, onAnalyzeNow, recordingState, saving, suggesting]
  );
  const visibleSlashCommands = quickCommands.filter((command) => !command.disabled);

  useEffect(() => {
    setSlashIndex((index) => Math.min(index, Math.max(0, visibleSlashCommands.length - 1)));
  }, [visibleSlashCommands.length]);

  if (!open) return null;

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
      setRecordingError('当前环境不支持语音录制。');
      return;
    }
    setRecordingState('requesting');
    try {
      const stream = await getUserMediaWithTimeout({ audio: true });
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
        setRecordingState('idle');
      };
      recorder.start();
      setRecordingState('recording');
    } catch (caught) {
      setRecordingState('idle');
      setRecordingError(recordingErrorMessage(caught));
    }
  }

  function stopRecording(): void {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
  }

  function toggleSuggestion(key: string): void {
    setSelectedSuggestionKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  }

  function removeFile(index: number): void {
    draftTriggerRef.current = 'attachment';
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  function renameFile(index: number): void {
    const file = files[index];
    if (!file) return;
    const nextName = window.prompt('重命名附件', file.name)?.trim();
    if (!nextName || nextName === file.name) return;
    draftTriggerRef.current = 'attachment';
    setFiles((current) =>
      current.map((item, i) =>
        i === index ? new File([item], nextName, { type: item.type, lastModified: item.lastModified }) : item
      )
    );
  }

  function previewFile(file: File): void {
    const url = URL.createObjectURL(file);
    window.open(url, '_blank', 'noopener');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function prefixLine(prefix: '•' | '-' | '○'): void {
    draftTriggerRef.current = 'typing';
    editorRef.current?.prefixCurrentLine(prefix);
  }

  function insertText(text: string): void {
    draftTriggerRef.current = 'typing';
    editorRef.current?.insertText(text);
  }

  function openProjectPicker(): void {
    if (projects.length === 0) {
      insertText('@');
      return;
    }
    setProjectPickerOpen((value) => !value);
  }

  function insertProject(project: ProjectSummaryDTO): void {
    const token = project.slug?.trim() || project.name.trim();
    if (!token) return;
    insertText(`@${token} `);
    setProjectPickerOpen(false);
  }

  function toggleRecording(): void {
    if (recordingState === 'recording') {
      stopRecording();
      return;
    }
    if (recordingState !== 'requesting') void startRecording();
  }

  function consumeSlashTrigger(): void {
    const editor = editorRef.current;
    if (editor && !editor.deleteBeforeCursor('/')) editor.deleteBeforeCursor('、');
    setSlashOpen(false);
    setSlashIndex(0);
  }

  function runQuickCommand(id: QuickCaptureCommandId, fromSlash = false): void {
    if (fromSlash) consumeSlashTrigger();
    else setSlashOpen(false);

    if (id === 'task') prefixLine('•');
    else if (id === 'idea') prefixLine('-');
    else if (id === 'event') prefixLine('○');
    else if (id === 'tag') insertText('#');
    else if (id === 'project') openProjectPicker();
    else if (id === 'attachment') fileInputRef.current?.click();
    else if (id === 'voice') toggleRecording();
    else if (id === 'analyze') onAnalyzeNow?.();
    else if (id === 'save') save();
  }

  function handleSlashCommand(command: MarkdownLiveEditorKeyCommand): boolean {
    if (!slashOpen) return false;
    if (command === 'arrow-down') {
      setSlashIndex((index) => (index + 1) % Math.max(visibleSlashCommands.length, 1));
      return true;
    }
    if (command === 'arrow-up') {
      setSlashIndex((index) => (index - 1 + Math.max(visibleSlashCommands.length, 1)) % Math.max(visibleSlashCommands.length, 1));
      return true;
    }
    if (command === 'enter' || command === 'tab') {
      const selected = visibleSlashCommands[slashIndex];
      if (selected) runQuickCommand(selected.id, true);
      return true;
    }
    if (command === 'escape') {
      setSlashOpen(false);
      setSlashIndex(0);
      return true;
    }
    return false;
  }

  function handleEditorKeyDown(event: KeyboardEvent): boolean {
    const mod = event.metaKey || event.ctrlKey;

    if (slashOpen && !mod && !event.altKey) {
      const commandByKey: Partial<Record<string, MarkdownLiveEditorKeyCommand>> = {
        ArrowDown: 'arrow-down',
        ArrowUp: 'arrow-up',
        Enter: 'enter',
        Tab: 'tab',
        Escape: 'escape'
      };
      const command = commandByKey[event.key];
      if (command && handleSlashCommand(command)) {
        event.preventDefault();
        return true;
      }
    }

    if (slashOpen && !mod && !event.altKey && event.key.length === 1 && event.key !== '/') {
      setSlashOpen(false);
      setSlashIndex(0);
    }

    if (!mod && !event.altKey && event.key === '/') {
      const beforeCursor = editorRef.current?.currentLineBeforeCursor() ?? '';
      if (beforeCursor.trim().length > 0) return false;
      event.preventDefault();
      setSlashOpen(true);
      setSlashIndex(0);
      return true;
    }

    return false;
  }

  function handleEditorKeyCommand(command: MarkdownLiveEditorKeyCommand): boolean {
    if (handleSlashCommand(command)) return true;

    const commandByKey: Partial<Record<MarkdownLiveEditorKeyCommand, QuickCaptureCommandId>> = {
      'mod-1': 'task',
      'mod-2': 'idea',
      'mod-3': 'event',
      'mod-4': 'tag',
      'mod-5': 'project',
      'mod-6': 'attachment',
      'mod-7': 'voice',
      'mod-k': 'analyze'
    };
    const action = commandByKey[command];
    if (action) {
      runQuickCommand(action);
      return true;
    }

    return false;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-950/30 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-capture-title"
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
            <h2 id="quick-capture-title" className="text-sm font-semibold">快速捕获</h2>
            <p className="text-xs text-neutral-500">输入、粘贴、拖入文件或录制语音 · ⌘⇧I</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900">
            Esc
          </button>
        </div>

        {saveResult ? (
          <QuickCaptureResultView
            result={saveResult}
            onContinue={onContinue}
            onOpenNote={onOpenNote}
            onOpenLibrary={onOpenLibrary}
            onOpenInbox={onOpenInbox}
            onClose={onClose}
          />
        ) : (
        <>
        <div className="space-y-4 p-4">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => addFiles(Array.from(event.currentTarget.files ?? []), 'attachment')}
          />
          <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
            <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap border-b border-neutral-200 bg-neutral-50 px-2 py-2 dark:border-neutral-800 dark:bg-neutral-900/70">
              <CaptureToolButton
                glyph="•"
                label="任务"
                title="插入任务符号（⌘1）"
                onClick={() => runQuickCommand('task')}
              />
              <CaptureToolButton
                glyph="-"
                label="想法"
                title="插入想法符号（⌘2）"
                onClick={() => runQuickCommand('idea')}
              />
              <CaptureToolButton
                glyph="○"
                label="事件"
                title="插入事件符号（⌘3）"
                onClick={() => runQuickCommand('event')}
              />
              <CaptureToolButton
                glyph="#"
                label="标签"
                title="插入标签（⌘4）"
                onClick={() => runQuickCommand('tag')}
              />
              <div className="relative">
                <CaptureToolButton
                  glyph="@"
                  label="项目"
                  title="关联项目（⌘5）"
                  onClick={() => runQuickCommand('project')}
                />
                {projectPickerOpen ? (
                  <div className="absolute left-0 top-9 z-20 max-h-64 w-64 overflow-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-xl dark:border-neutral-800 dark:bg-neutral-950">
                    {projects.slice(0, 10).map((project) => (
                      <button
                        key={project.uid}
                        type="button"
                        onClick={() => insertProject(project)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-neutral-100 dark:hover:bg-neutral-900"
                      >
                        <span className="min-w-0 truncate font-medium">{project.name}</span>
                        <span className="shrink-0 text-[11px] text-neutral-500">@{project.slug}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <CaptureToolButton
                icon={<Paperclip size={13} />}
                label="附件"
                title="添加附件（⌘6）"
                onClick={() => runQuickCommand('attachment')}
              />
              {recordingState !== 'recording' ? (
                <CaptureToolButton
                  icon={<Mic size={13} />}
                  label={recordingState === 'requesting' ? '请求中' : '语音'}
                  title="录制语音（⌘7）"
                  onClick={() => runQuickCommand('voice')}
                  disabled={recordingState === 'requesting'}
                  tone="danger"
                />
              ) : (
                <button type="button" onClick={() => runQuickCommand('voice')} title="停止录制（⌘7）" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-rose-600 px-2.5 text-xs font-medium text-white hover:bg-rose-500">
                  <Mic size={13} />
                  停止
                </button>
              )}
              <span className="mx-0.5 h-4 w-px shrink-0 bg-neutral-200 dark:bg-neutral-800" />
              <CaptureToolButton
                icon={<RefreshCw size={13} className={suggesting ? 'animate-spin' : ''} />}
                label="分析"
                title="立即分析（⌘K）"
                onClick={() => runQuickCommand('analyze')}
                disabled={suggesting || !onAnalyzeNow}
              />
              <CaptureToolButton
                icon={<Save size={13} />}
                label={saving ? '保存中' : acceptedSuggestions.length > 0 ? `保存 + ${acceptedSuggestions.length}` : '保存'}
                title="保存捕获（⌘Enter）"
                onClick={() => runQuickCommand('save')}
                disabled={!canSave || saving}
                tone="primary"
              />
            </div>
            <MarkdownLiveEditor
              value={content}
              onChange={setContent}
              mode="live"
              dark={dark}
              vaultRoot={vaultRoot}
              minHeight={240}
              autoFocus
              editorRef={editorRef}
              onPaste={() => {
                draftTriggerRef.current = 'paste';
              }}
              onKeyDown={handleEditorKeyDown}
              onKeyCommand={handleEditorKeyCommand}
              onModEnter={save}
              onEscape={onClose}
              placeholder="用 • 写任务，- 写想法，○ 写事件；#标签 @项目"
              className="h-64 w-full"
            />
            {slashOpen && visibleSlashCommands.length > 0 ? (
              <SlashCommandMenu
                commands={visibleSlashCommands}
                selectedIndex={slashIndex}
                onHover={setSlashIndex}
                onSelect={(command) => runQuickCommand(command.id, true)}
              />
            ) : null}
            {files.length > 0 || audioFile || recordingError ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 px-3 py-2 text-xs dark:border-neutral-800">
                {files.length > 0 ? <span className="text-neutral-500">{files.length} 个文件</span> : null}
                {audioFile ? <span className="text-neutral-500">{audioDurationSec} 秒语音</span> : null}
                {recordingError ? <span className="text-red-600 dark:text-red-300">{recordingError}</span> : null}
              </div>
            ) : null}
          </div>

          {files.length > 0 ? (
            <AttachmentList files={files} onPreview={previewFile} onRename={renameFile} onRemove={removeFile} />
          ) : null}

          <SuggestionStrip
            suggestions={suggestions}
            selectedKeys={selectedSuggestionKeys}
            suggesting={suggesting}
            tags={suggestionResult?.tags ?? []}
            onToggle={toggleSuggestion}
          />
          {error ? <p className="text-xs text-red-600 dark:text-red-300">{error}</p> : null}
        </div>
        </>
        )}
      </div>
    </div>
  );
}

function CaptureToolButton({
  icon,
  glyph,
  label,
  title,
  onClick,
  disabled = false,
  tone = 'neutral'
}: {
  icon?: JSX.Element;
  glyph?: string;
  label: string;
  title: string;
  onClick?(): void;
  disabled?: boolean;
  tone?: 'neutral' | 'primary' | 'danger';
}): JSX.Element {
  const toneClass =
    tone === 'primary'
      ? 'border-sky-600 bg-sky-600 text-white hover:bg-sky-500 disabled:border-sky-600 disabled:bg-sky-600'
      : tone === 'danger'
        ? 'border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-200 dark:hover:bg-rose-950/30'
        : 'border-neutral-200 bg-white text-neutral-700 hover:border-sky-300 hover:text-sky-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:border-sky-700 dark:hover:text-sky-200';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      title={title}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
    >
      {icon ?? (glyph ? <span className="font-mono text-sm leading-none">{glyph}</span> : null)}
      {label}
    </button>
  );
}

function SlashCommandMenu({
  commands,
  selectedIndex,
  onHover,
  onSelect
}: {
  commands: QuickCaptureCommand[];
  selectedIndex: number;
  onHover(index: number): void;
  onSelect(command: QuickCaptureCommand): void;
}): JSX.Element {
  return (
    <div className="absolute left-3 top-12 z-20 max-h-48 w-56 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1 shadow-lg overscroll-contain [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-300 [&::-webkit-scrollbar-track]:bg-transparent dark:border-neutral-800 dark:bg-neutral-950 dark:[&::-webkit-scrollbar-thumb]:bg-neutral-700">
      <div className="px-2 py-1 text-[10px] font-medium text-neutral-400">/ 命令</div>
      {commands.map((command, index) => {
        const active = index === selectedIndex;
        return (
          <button
            key={command.id}
            type="button"
            title={command.description}
            aria-label={`${command.label}：${command.description}`}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onHover(index)}
            onClick={() => onSelect(command)}
            className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs ${
              active
                ? 'bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-100'
                : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-900'
            }`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-neutral-200 bg-white font-mono text-xs dark:border-neutral-800 dark:bg-neutral-950">
              {command.icon ?? command.glyph}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{command.label}</span>
            {command.shortcut ? <span className="shrink-0 text-[10px] text-neutral-400">{command.shortcut}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function QuickCaptureResultView({
  result,
  onContinue,
  onOpenNote,
  onOpenLibrary,
  onOpenInbox,
  onClose
}: {
  result: QuickCaptureSaveResult;
  onContinue?(): void;
  onOpenNote?(): void;
  onOpenLibrary?(): void;
  onOpenInbox?(): void;
  onClose(): void;
}): JSX.Element {
  return (
    <div className="space-y-4 p-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold">捕获已保存</div>
            <div className="mt-1 text-xs opacity-80">
              已创建笔记「{result.note.title}」
              {result.libraryItems.length > 0 ? `，并保存 ${result.libraryItems.length} 个资料库条目` : ''}
              {result.inboxItems.length > 0 ? `，创建 ${result.inboxItems.length} 个待处理任务` : ''}。
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-2 text-xs sm:grid-cols-3">
        <ResultActionButton icon={<FileText size={14} />} label="打开笔记" onClick={onOpenNote} />
        <ResultActionButton
          icon={<Library size={14} />}
          label="查看资料库"
          onClick={onOpenLibrary}
          disabled={result.libraryItems.length === 0}
        />
        <ResultActionButton
          icon={<Inbox size={14} />}
          label="处理收件箱"
          onClick={onOpenInbox}
          disabled={result.inboxItems.length === 0}
        />
      </div>

      {result.markers.length > 0 ? (
        <div className="rounded-xl border border-neutral-200 p-3 text-xs dark:border-neutral-800">
          <div className="font-medium">后续标记</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {result.markers.map((marker) => (
              <span key={marker} className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                #{marker}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {result.warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle size={14} />
            部分行动需要重试
          </div>
          <ul className="mt-2 space-y-1">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium dark:border-neutral-700"
        >
          <RotateCcw size={13} />
          继续捕获
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          <X size={13} />
          完成
        </button>
      </div>
    </div>
  );
}

function ResultActionButton({
  icon,
  label,
  onClick,
  disabled = false
}: {
  icon: JSX.Element;
  label: string;
  onClick?(): void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 font-medium text-neutral-700 hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-800 dark:text-neutral-200 dark:hover:border-sky-700 dark:hover:text-sky-200"
    >
      {icon}
      {label}
    </button>
  );
}

function AttachmentList({
  files,
  onPreview,
  onRename,
  onRemove
}: {
  files: File[];
  onPreview(file: File): void;
  onRename(index: number): void;
  onRemove(index: number): void;
}): JSX.Element {
  return (
    <div className="space-y-2 rounded-xl border border-neutral-200 p-3 text-xs dark:border-neutral-800">
      {files.map((file, index) => (
        <div key={`${file.name}:${file.lastModified}:${index}`} className="flex items-center gap-2">
          <FileText size={14} className="shrink-0 text-neutral-500" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{file.name}</div>
            <div className="text-[11px] text-neutral-500">{formatFileSize(file.size)}{file.type ? ` · ${file.type}` : ''}</div>
          </div>
          <button type="button" onClick={() => onPreview(file)} className="rounded border border-neutral-200 px-2 py-1 hover:border-sky-300 dark:border-neutral-800">
            预览
          </button>
          <button type="button" onClick={() => onRename(index)} className="rounded border border-neutral-200 px-2 py-1 hover:border-sky-300 dark:border-neutral-800">
            重命名
          </button>
          <button type="button" onClick={() => onRemove(index)} className="rounded border border-neutral-200 px-2 py-1 hover:border-red-300 hover:text-red-600 dark:border-neutral-800">
            移除
          </button>
        </div>
      ))}
    </div>
  );
}

function SuggestionStrip({
  suggestions,
  selectedKeys,
  suggesting,
  tags,
  onToggle,
  onAnalyzeNow
}: {
  suggestions: QuickCaptureSuggestion[];
  selectedKeys: string[];
  suggesting: boolean;
  tags: string[];
  onToggle(id: string): void;
  onAnalyzeNow?(): void;
}): JSX.Element {
  const visibleTags = useMemo(() => tags.slice(0, 4), [tags]);
  if (suggestions.length === 0 && !suggesting && visibleTags.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
        <span>暂停输入后会出现 AI 建议。</span>
        {onAnalyzeNow ? <AnalyzeButton suggesting={suggesting} onAnalyzeNow={onAnalyzeNow} /> : null}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <span>建议</span>
          {suggesting ? <span>思考中…</span> : null}
        </div>
        {onAnalyzeNow ? <AnalyzeButton suggesting={suggesting} onAnalyzeNow={onAnalyzeNow} /> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => {
          const key = suggestionKey(suggestion);
          const active = selectedKeys.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                active
                  ? 'border-sky-400 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-100'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:border-sky-300 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200'
              }`}
              title={suggestion.detail ?? quickCaptureActionDetail(suggestion.action)}
            >
              {quickCaptureActionLabel(suggestion.action)}
              {suggestion.risk === 'proposal' ? ' · 建议' : ''}
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
      aria-label="分析"
      title="立即分析"
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:border-sky-300 hover:text-sky-700 disabled:cursor-wait disabled:opacity-60 dark:border-neutral-800 dark:hover:border-sky-700 dark:hover:text-sky-200"
    >
      <RefreshCw size={13} className={suggesting ? 'animate-spin' : ''} />
    </button>
  );
}

function suggestionKey(suggestion: QuickCaptureSuggestion): string {
  return quickCaptureSuggestionStableId(suggestion.action, suggestion.params);
}

function getUserMediaWithTimeout(constraints: MediaStreamConstraints): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('麦克风授权超时，请检查系统权限后重试。'));
    }, 8000);
    navigator.mediaDevices.getUserMedia(constraints).then(
      (stream) => {
        window.clearTimeout(timer);
        resolve(stream);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function recordingErrorMessage(caught: unknown): string {
  const message = (caught as Error).message || String(caught);
  if (/permission|denied|notallowed/i.test(message)) return '麦克风权限被拒绝，请在系统设置中允许 Orbit 使用麦克风。';
  if (/timeout|超时/i.test(message)) return message;
  return `语音录制失败：${message}`;
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
