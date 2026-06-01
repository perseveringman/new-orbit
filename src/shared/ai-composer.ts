import type { RuntimeRouteModelTier, RuntimeRouteTrack } from './runtime';

export type ComposerDensity = 'floating' | 'compact' | 'full';

export type ComposerSourceSurface =
  | 'ask_floating'
  | 'ask_full'
  | 'sidebar_ask'
  | 'conversation_center'
  | 'task_chat'
  | 'inbox_chat'
  | 'unknown';

export type ComposerAttachmentKind =
  | 'file'
  | 'image'
  | 'audio'
  | 'video'
  | 'url'
  | 'note'
  | 'artifact';

export type ComposerAttachmentStatus = 'pending' | 'ready' | 'uploading' | 'error';

export interface ComposerAttachmentRef {
  id: string;
  kind: ComposerAttachmentKind;
  name: string;
  status: ComposerAttachmentStatus;
  mimeType?: string;
  sizeBytes?: number;
  uri?: string;
  error?: string;
}

export interface ComposerVoiceInput {
  status: 'idle' | 'recording' | 'transcribing' | 'error';
  transcript?: string;
  error?: string;
}

export interface RuntimeSelection {
  runtimeId?: string;
  endpointId?: string;
  model?: string;
  modelTier?: RuntimeRouteModelTier;
  track?: RuntimeRouteTrack;
  agentProfileId?: string;
}

export interface ComposerIntent {
  mode?: 'ask' | 'execute' | 'research' | 'capture' | 'review';
  toolMode?: 'auto' | 'read_only' | 'execute';
}

export interface ComposerDraft {
  text: string;
  attachments?: ComposerAttachmentRef[];
  selection?: RuntimeSelection;
  /** 明确选择的随处问 skill；缺省表示按当前 scope 自动加载全部可用 skill。 */
  skillRefs?: string[];
  intent?: ComposerIntent;
  voice?: ComposerVoiceInput;
  clientMeta?: {
    sourceSurface?: ComposerSourceSurface;
    submittedAt?: string;
    draftId?: string;
  };
}

export interface ComposerCapabilities {
  canSend: boolean;
  canAttachFiles?: boolean;
  canRecordVoice?: boolean;
  canSwitchModel?: boolean;
  canSwitchRuntime?: boolean;
  canSwitchProfile?: boolean;
}

export interface ComposerRuntimeOption {
  id: string;
  label: string;
  provider?: string;
  track?: RuntimeRouteTrack;
  endpointId?: string;
  defaultModel?: string;
  status?: 'online' | 'offline' | 'degraded' | 'disabled';
  disabled?: boolean;
  description?: string;
}

export interface ComposerModelOption {
  id: string;
  label: string;
  model: string;
  runtimeId?: string;
  endpointId?: string;
  modelTier?: RuntimeRouteModelTier;
  disabled?: boolean;
  description?: string;
}

export interface ComposerProfileOption {
  id: string;
  label: string;
  description?: string;
}

export interface ComposerSkillOption {
  id: string;
  label: string;
  description?: string;
  source?: 'app' | 'vault' | 'space';
  disabled?: boolean;
  disabledReason?: string;
}

export interface ComposerOptions {
  runtimes: ComposerRuntimeOption[];
  models: ComposerModelOption[];
  profiles: ComposerProfileOption[];
  skills?: ComposerSkillOption[];
  defaultSelection: RuntimeSelection;
}

export function legacyTextToComposerDraft(
  text: string,
  selection?: RuntimeSelection,
  sourceSurface: ComposerSourceSurface = 'unknown'
): ComposerDraft {
  return {
    text,
    attachments: [],
    ...(selection ? { selection } : {}),
    clientMeta: {
      sourceSurface,
      submittedAt: new Date().toISOString()
    }
  };
}

export function normalizeRuntimeSelection(
  selection?: RuntimeSelection | null
): RuntimeSelection {
  if (!selection) return {};
  const runtimeId = selection.runtimeId?.trim();
  const inferredEndpoint = endpointFromSdkRuntimeId(runtimeId);
  const endpointId = selection.endpointId?.trim() || inferredEndpoint;
  const model = normalizeSelectionModel(selection, endpointId);
  const track =
    (selection.track === 'cli' && endpointId) || (!selection.track && endpointId)
      ? 'sdk_agent'
      : selection.track;
  return {
    ...(runtimeId ? { runtimeId } : {}),
    ...(endpointId ? { endpointId } : {}),
    ...(model ? { model } : {}),
    ...(selection.modelTier ? { modelTier: selection.modelTier } : {}),
    ...(track ? { track } : {}),
    ...(selection.agentProfileId ? { agentProfileId: selection.agentProfileId } : {})
  };
}

function normalizeSelectionModel(
  selection: RuntimeSelection,
  endpointId?: string
): string | undefined {
  const model = selection.model?.trim();
  if (!model) return undefined;
  if (
    endpointId === 'deepseek' &&
    selection.modelTier === 'default' &&
    isLegacyDeepSeekDefaultModel(model)
  ) {
    return 'deepseek-v4-flash';
  }
  return model;
}

function isLegacyDeepSeekDefaultModel(model: string): boolean {
  return (
    model === 'deepseek-v4-pro' ||
    model === 'deepseek-chat' ||
    model === 'claude-3-5-sonnet-latest'
  );
}

function endpointFromSdkRuntimeId(runtimeId?: string): string | undefined {
  if (!runtimeId) return undefined;
  const match = runtimeId.match(/^sdk(?:_agent|-agent)?:(.+)$/);
  return match?.[1] || undefined;
}
