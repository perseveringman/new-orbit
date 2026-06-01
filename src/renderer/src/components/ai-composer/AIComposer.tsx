import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type ReactNode
} from 'react';
import {
  Bot,
  Check,
  Cpu,
  FilePlus2,
  Globe2,
  Lightbulb,
  Loader2,
  Mic,
  SendHorizontal,
  Sparkles,
  Telescope,
  X
} from 'lucide-react';
import type {
  ComposerAttachmentRef,
  ComposerCapabilities,
  ComposerDensity,
  ComposerDraft,
  ComposerOptions,
  ComposerSourceSurface,
  RuntimeSelection
} from '@shared/ai-composer';
import { normalizeRuntimeSelection } from '@shared/ai-composer';

interface AIComposerProps {
  disabled?: boolean;
  submitting?: boolean;
  density?: ComposerDensity;
  placeholder?: string;
  sourceSurface?: ComposerSourceSurface;
  options?: ComposerOptions;
  selection?: RuntimeSelection;
  capabilities?: Partial<ComposerCapabilities>;
  autoFocus?: boolean;
  rightActions?: ReactNode;
  onSelectionChange?: (selection: RuntimeSelection) => void;
  onSubmit: (draft: ComposerDraft) => void;
}

interface ComposerAttachmentPreview extends ComposerAttachmentRef {
  previewUrl?: string;
}

const FALLBACK_OPTIONS: ComposerOptions = {
  runtimes: [],
  models: [],
  profiles: [{ id: 'default-agent', label: '默认 Agent' }],
  skills: [],
  defaultSelection: { agentProfileId: 'default-agent' }
};

export function AIComposer({
  disabled = false,
  submitting = false,
  density = 'full',
  placeholder,
  sourceSurface = 'unknown',
  options = FALLBACK_OPTIONS,
  selection,
  capabilities,
  autoFocus = false,
  rightActions,
  onSelectionChange,
  onSubmit
}: AIComposerProps): JSX.Element {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentsRef = useRef<ComposerAttachmentPreview[]>([]);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<ComposerAttachmentPreview[]>([]);
  const [voice, setVoice] = useState<{ status: 'idle' | 'recording' | 'transcribing' | 'error'; transcript?: string; error?: string }>({
    status: 'idle'
  });
  const [localSelection, setLocalSelection] = useState<RuntimeSelection>(() =>
    normalizeRuntimeSelection(selection ?? options.defaultSelection)
  );
  const [selectedSkillRefs, setSelectedSkillRefs] = useState<string[]>([]);
  const currentSelection = normalizeRuntimeSelection(selection ?? localSelection);
  const mergedCapabilities: ComposerCapabilities = {
    canSend: true,
    canAttachFiles: true,
    canRecordVoice: true,
    canSwitchModel: true,
    canSwitchRuntime: true,
    canSwitchProfile: true,
    ...capabilities
  };
  const runtimeValue = currentSelection.runtimeId ?? '';
  const profileValue =
    currentSelection.agentProfileId ?? options.defaultSelection.agentProfileId ?? options.profiles[0]?.id ?? '';
  const availableModels = modelsForSelection(options, currentSelection);
  const modelValue = selectedModelValue(availableModels, currentSelection);
  const skillOptions = options.skills ?? [];

  useEffect(() => {
    if (selection) setLocalSelection(normalizeRuntimeSelection(selection));
  }, [selection]);

  useEffect(() => {
    setSelectedSkillRefs((current) =>
      current.filter((name) => skillOptions.some((skill) => skill.id === name && !skill.disabled))
    );
  }, [skillOptions]);

  useEffect(() => {
    if (!autoFocus) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(
    () => () => {
      for (const attachment of attachmentsRef.current) revokeAttachmentPreview(attachment);
    },
    []
  );

  function updateSelection(next: RuntimeSelection): void {
    const normalized = normalizeRuntimeSelection(next);
    if (!selection) setLocalSelection(normalized);
    onSelectionChange?.(normalized);
  }

  function handleRuntimeChange(runtimeId: string): void {
    const runtime = options.runtimes.find((item) => item.id === runtimeId);
    const model =
      options.models.find((item) => item.runtimeId === runtimeId && !item.disabled) ??
      options.models.find((item) => item.endpointId === runtime?.endpointId && !item.disabled);
    updateSelection({
      ...currentSelection,
      runtimeId: runtimeId || undefined,
      track: runtime?.track ?? currentSelection.track,
      endpointId: runtime?.endpointId,
      model: model?.model ?? runtime?.defaultModel ?? currentSelection.model,
      modelTier: model?.modelTier
    });
  }

  function handleModelChange(value: string): void {
    const model = options.models.find((item) => item.id === value);
    if (!model) return;
    const runtime = model.runtimeId
      ? options.runtimes.find((item) => item.id === model.runtimeId)
      : undefined;
    updateSelection({
      ...currentSelection,
      runtimeId: model.runtimeId ?? currentSelection.runtimeId,
      endpointId: model.endpointId ?? runtime?.endpointId,
      track: runtime?.track ?? currentSelection.track,
      model: model.model,
      modelTier: model.modelTier
    });
  }

  function handleProfileChange(agentProfileId: string): void {
    updateSelection({ ...currentSelection, agentProfileId });
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    addFiles(files, 'picker');
    event.target.value = '';
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>): void {
    const files = filesFromClipboard(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    addFiles(files, 'paste');
  }

  function addFiles(files: File[], source: 'picker' | 'paste'): void {
    if (!mergedCapabilities.canAttachFiles || disabled || files.length === 0) return;
    const next = files.map((file, index) => fileToAttachment(file, source, index));
    setAttachments((current) => [...current, ...next]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled || submitting || !mergedCapabilities.canSend) return;
    onSubmit({
      text: trimmed,
      attachments: attachments.map(stripAttachmentPreview),
      selection: currentSelection,
      ...(selectedSkillRefs.length > 0 ? { skillRefs: selectedSkillRefs } : {}),
      voice: voice.status === 'idle' ? undefined : voice,
      clientMeta: {
        sourceSurface,
        submittedAt: new Date().toISOString()
      }
    });
    for (const attachment of attachments) revokeAttachmentPreview(attachment);
    setText('');
    setAttachments([]);
    setVoice({ status: 'idle' });
  }

  function startVoiceInput(): void {
    if (!mergedCapabilities.canRecordVoice || disabled) return;
    const SpeechRecognition = resolveSpeechRecognition();
    if (!SpeechRecognition) {
      setVoice({ status: 'error', error: '当前环境不支持语音识别。' });
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setVoice({ status: 'recording' });
    recognition.onerror = () => setVoice({ status: 'error', error: '语音识别失败。' });
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? '';
      setVoice({ status: 'idle', transcript });
      if (transcript) setText((current) => (current ? `${current} ${transcript}` : transcript));
    };
    recognition.onend = () => {
      setVoice((current) => (current.status === 'recording' ? { status: 'idle' } : current));
    };
    recognition.start();
  }

  const compact = density === 'floating' || density === 'compact';
  const rootClassName = [
    density === 'floating'
      ? 'rounded-[28px] bg-white/95 shadow-2xl ring-1 ring-neutral-200/80 backdrop-blur-xl dark:bg-neutral-950/95 dark:ring-neutral-800/80'
      : 'border-t border-neutral-200 bg-white/95 dark:border-neutral-800 dark:bg-neutral-950/95',
    compact ? 'px-2 py-2' : 'px-3 py-3'
  ].join(' ');

  return (
    <form onSubmit={handleSubmit} className={rootClassName}>
      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        <div className="flex min-w-0 flex-wrap items-center gap-2 px-1">
          <SelectPill
            icon={<Cpu size={14} />}
            label="切换模型"
            value={modelValue}
            disabled={disabled || !mergedCapabilities.canSwitchModel || availableModels.length === 0}
            onChange={handleModelChange}
            options={availableModels.map((model) => ({
              value: model.id,
              label: model.label,
              disabled: model.disabled
            }))}
            fallbackLabel={currentSelection.model ?? '模型'}
          />
          <SelectPill
            icon={<Bot size={14} />}
            label="切换 Agent"
            value={profileValue}
            disabled={disabled || !mergedCapabilities.canSwitchProfile || options.profiles.length === 0}
            onChange={handleProfileChange}
            options={options.profiles.map((profile) => ({ value: profile.id, label: profile.label }))}
            fallbackLabel="Agent"
          />
          <SelectPill
            icon={<Globe2 size={14} />}
            label="切换 runtime"
            value={runtimeValue}
            disabled={disabled || !mergedCapabilities.canSwitchRuntime || options.runtimes.length === 0}
            onChange={handleRuntimeChange}
            options={options.runtimes.map((runtime) => ({
              value: runtime.id,
              label: runtime.label,
              disabled: runtime.disabled
            }))}
            fallbackLabel="Runtime"
          />
          <SkillPicker
            options={skillOptions}
            selected={selectedSkillRefs}
            disabled={disabled || skillOptions.length === 0}
            onChange={setSelectedSkillRefs}
          />
        </div>

        {attachments.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto px-1">
            {attachments.map((attachment) => (
              <AttachmentPreviewItem
                key={attachment.id}
                attachment={attachment}
                onRemove={() => {
                  revokeAttachmentPreview(attachment);
                  setAttachments((current) =>
                    current.filter((item) => item.id !== attachment.id)
                  );
                }}
              />
            ))}
          </div>
        ) : null}

        <textarea
          ref={inputRef}
          rows={compact ? 1 : 3}
          value={text}
          disabled={disabled}
          placeholder={placeholder ?? '问 Orbit，或交给智能体执行...'}
          onChange={(event) => setText(event.target.value)}
          onPaste={handlePaste}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          className={[
            'w-full resize-none bg-transparent px-1 text-sm text-neutral-950 outline-none placeholder:text-neutral-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-neutral-50 dark:placeholder:text-neutral-500',
            compact ? 'min-h-8 leading-8' : 'min-h-20 leading-relaxed'
          ].join(' ')}
        />

        <div className="flex items-center gap-2 px-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFiles}
          />
          <IconButton
            title="上传文件"
            disabled={disabled || !mergedCapabilities.canAttachFiles}
            onClick={() => fileInputRef.current?.click()}
          >
            <FilePlus2 size={17} />
          </IconButton>
          <div className="h-6 w-px bg-neutral-200 dark:bg-neutral-800" />
          <IconButton title="灵感模式" disabled={disabled}>
            <Lightbulb size={17} />
          </IconButton>
          <IconButton title="研究模式" disabled={disabled}>
            <Telescope size={17} />
          </IconButton>
          <IconButton
            title={voice.status === 'recording' ? '正在录音' : '语音输入'}
            disabled={disabled || !mergedCapabilities.canRecordVoice}
            active={voice.status === 'recording'}
            onClick={startVoiceInput}
          >
            <Mic size={17} />
          </IconButton>
          {voice.status === 'error' ? (
            <span className="truncate text-[11px] text-rose-500">{voice.error}</span>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            {rightActions}
            <button
              type="submit"
              title="发送"
              aria-label="发送"
              disabled={disabled || submitting || !text.trim() || !mergedCapabilities.canSend}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
            >
              {submitting ? <Loader2 size={17} className="animate-spin" /> : <SendHorizontal size={18} />}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function SelectPill({
  icon,
  label,
  value,
  options,
  disabled,
  fallbackLabel,
  onChange
}: {
  icon: ReactNode;
  label: string;
  value: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  disabled?: boolean;
  fallbackLabel: string;
  onChange: (value: string) => void;
}): JSX.Element {
  const selected = options.find((item) => item.value === value);
  return (
    <label className="relative min-w-0 shrink-0">
      <span className="sr-only">{label}</span>
      <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-neutral-500 dark:text-neutral-400">
        {icon}
      </span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 max-w-52 appearance-none rounded-full border border-neutral-200 bg-white py-0 pl-8 pr-3 text-sm font-medium text-neutral-900 outline-none transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
      >
        {selected ? null : <option value="">{fallbackLabel}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SkillPicker({
  options,
  selected,
  disabled,
  onChange
}: {
  options: ComposerOptions['skills'];
  selected: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(selected);
  const activeOptions = options ?? [];
  const label = selected.length > 0 ? `技能 ${selected.length}` : '技能 自动';

  function toggle(id: string): void {
    onChange(selectedSet.has(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="选择技能"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 max-w-52 items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 outline-none transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
      >
        <Sparkles size={14} className="text-neutral-500 dark:text-neutral-400" />
        <span className="truncate">{label}</span>
      </button>
      {open && !disabled ? (
        <div className="absolute left-0 top-10 z-30 w-80 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">选择技能</span>
            <button
              type="button"
              onClick={() => {
                onChange([]);
                setOpen(false);
              }}
              className="text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              自动匹配
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {activeOptions.map((skill) => {
              const checked = selectedSet.has(skill.id);
              return (
                <button
                  key={skill.id}
                  type="button"
                  disabled={skill.disabled}
                  onClick={() => toggle(skill.id)}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-900"
                >
                  <span
                    className={[
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      checked
                        ? 'border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950'
                        : 'border-neutral-300 text-transparent dark:border-neutral-700'
                    ].join(' ')}
                  >
                    <Check size={11} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-mono text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                        {skill.label}
                      </span>
                      {skill.source ? (
                        <span className="shrink-0 rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                          {skill.source}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
                      {skill.disabledReason || skill.description || '未填写描述'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IconButton({
  children,
  title,
  disabled,
  active,
  onClick
}: {
  children: ReactNode;
  title: string;
  disabled?: boolean;
  active?: boolean;
  onClick?: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200'
          : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-100'
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function AttachmentPreviewItem({
  attachment,
  onRemove
}: {
  attachment: ComposerAttachmentPreview;
  onRemove: () => void;
}): JSX.Element {
  if (isImageAttachment(attachment) && attachment.previewUrl) {
    return (
      <div className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-neutral-200 bg-neutral-100 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <img
          src={attachment.previewUrl}
          alt={attachment.name}
          className="h-full w-full object-cover"
          draggable={false}
        />
        <button
          type="button"
          aria-label={`移除 ${attachment.name}`}
          onClick={onRemove}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-neutral-600 shadow-sm ring-1 ring-neutral-200 transition hover:bg-white hover:text-neutral-950 dark:bg-neutral-950/90 dark:text-neutral-300 dark:ring-neutral-800 dark:hover:text-white"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex max-w-48 shrink-0 items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
      <FilePlus2 size={13} className="shrink-0" />
      <span className="truncate">{attachment.name}</span>
      <button
        type="button"
        aria-label={`移除 ${attachment.name}`}
        onClick={onRemove}
        className="shrink-0 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-50"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function modelsForSelection(
  options: ComposerOptions,
  selection: RuntimeSelection
): ComposerOptions['models'] {
  const scoped = options.models.filter((model) => {
    if (selection.runtimeId) return model.runtimeId === selection.runtimeId;
    if (selection.endpointId) return model.endpointId === selection.endpointId;
    return true;
  });
  return scoped.length > 0 ? scoped : options.models;
}

function selectedModelValue(
  models: ComposerOptions['models'],
  selection: RuntimeSelection
): string {
  if (!selection.model) return '';
  return (
    models.find((model) => {
      if (model.model !== selection.model) return false;
      if (selection.runtimeId && model.runtimeId && model.runtimeId !== selection.runtimeId) {
        return false;
      }
      if (selection.endpointId && model.endpointId && model.endpointId !== selection.endpointId) {
        return false;
      }
      if (selection.modelTier && model.modelTier && model.modelTier !== selection.modelTier) {
        return false;
      }
      return true;
    })?.id ?? ''
  );
}

function fileToAttachment(
  file: File,
  source: 'picker' | 'paste',
  index: number
): ComposerAttachmentPreview {
  const maybePath = file as File & { path?: string };
  const image = file.type.startsWith('image/');
  const previewUrl = image ? createAttachmentPreviewUrl(file) : undefined;
  return {
    id: `file-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind: image ? 'image' : 'file',
    name: attachmentNameForFile(file, source, index),
    status: 'ready',
    mimeType: file.type || undefined,
    sizeBytes: file.size,
    uri: maybePath.path,
    ...(previewUrl ? { previewUrl } : {})
  };
}

function attachmentNameForFile(file: File, source: 'picker' | 'paste', index: number): string {
  if (file.name && source === 'picker') return file.name;
  if (file.name && !isGenericClipboardImageName(file.name)) return file.name;
  if (!file.type.startsWith('image/')) return file.name || `粘贴文件 ${index + 1}`;
  return `粘贴图片 ${index + 1}.${imageExtension(file.type)}`;
}

function isGenericClipboardImageName(name: string): boolean {
  return /^image\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(name);
}

function imageExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/bmp') return 'bmp';
  return 'png';
}

function createAttachmentPreviewUrl(file: File): string | undefined {
  try {
    return URL.createObjectURL(file);
  } catch {
    return undefined;
  }
}

function revokeAttachmentPreview(attachment: ComposerAttachmentPreview): void {
  if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
}

function stripAttachmentPreview(attachment: ComposerAttachmentPreview): ComposerAttachmentRef {
  return {
    id: attachment.id,
    kind: attachment.kind,
    name: attachment.name,
    status: attachment.status,
    ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
    ...(attachment.sizeBytes !== undefined ? { sizeBytes: attachment.sizeBytes } : {}),
    ...(attachment.uri ? { uri: attachment.uri } : {}),
    ...(attachment.error ? { error: attachment.error } : {})
  };
}

function isImageAttachment(attachment: ComposerAttachmentRef): boolean {
  return attachment.kind === 'image' || Boolean(attachment.mimeType?.startsWith('image/'));
}

function filesFromClipboard(data: DataTransfer): File[] {
  const itemFiles = Array.from(data.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  if (itemFiles.length > 0) return itemFiles;
  return Array.from(data.files ?? []);
}

type SpeechRecognitionConstructor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onerror: (() => void) | null;
  onresult:
    | ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onend: (() => void) | null;
  start(): void;
};

function resolveSpeechRecognition(): SpeechRecognitionConstructor | null {
  const globalWindow = window as Window &
    typeof globalThis & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
  return globalWindow.SpeechRecognition ?? globalWindow.webkitSpeechRecognition ?? null;
}
