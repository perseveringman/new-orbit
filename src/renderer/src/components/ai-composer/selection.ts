import type { Conversation } from '@shared/conversation';
import type { ComposerOptions, RuntimeSelection } from '@shared/ai-composer';
import { normalizeRuntimeSelection } from '@shared/ai-composer';

export function selectionFromConversation(
  conversation: Conversation | null,
  fallback: RuntimeSelection
): RuntimeSelection {
  const saved = normalizeRuntimeSelection(conversation?.runtimeSelection);
  return {
    ...fallback,
    ...saved,
    ...(saved.endpointId || saved.runtimeId || saved.model
      ? {}
      : legacySelectionFromConversation(conversation))
  };
}

export function patchFromSelection(
  selection: RuntimeSelection,
  options: ComposerOptions
): {
  runtimeHint: string | null;
  runtimeEndpointHint: string | null;
  runtimeModelHint: string | null;
  runtimeSelection: RuntimeSelection;
} {
  const normalized = normalizeRuntimeSelection(selection);
  const runtimeHint = runtimeHintFromSelection(normalized, options);
  return {
    runtimeHint,
    runtimeEndpointHint: normalized.endpointId ?? null,
    runtimeModelHint: normalized.model ?? null,
    runtimeSelection: normalized
  };
}

export function runtimeHintFromSelection(
  selection: RuntimeSelection,
  options: ComposerOptions
): string | null {
  if (selection.track === 'cli') {
    return selection.runtimeId ?? 'claude';
  }
  const runtime = selection.runtimeId
    ? options.runtimes.find((item) => item.id === selection.runtimeId)
    : undefined;
  const track = selection.track ?? runtime?.track ?? 'sdk_agent';
  const endpointId = selection.endpointId ?? runtime?.endpointId;
  if (endpointId && selection.model) return `${track}:${endpointId}/${selection.model}`;
  if (endpointId) return `${track}:${endpointId}`;
  if (selection.model) return `${track}:auto/${selection.model}`;
  return null;
}

function legacySelectionFromConversation(conversation: Conversation | null): RuntimeSelection {
  if (!conversation) return {};
  const track = conversation.runtimeHint?.startsWith('sdk_agent')
    ? 'sdk_agent'
    : conversation.runtimeHint?.startsWith('sdk:')
      ? 'sdk'
      : conversation.runtimeHint
        ? 'cli'
        : undefined;
  return normalizeRuntimeSelection({
    endpointId: conversation.runtimeEndpointHint,
    model: conversation.runtimeModelHint,
    track
  });
}
