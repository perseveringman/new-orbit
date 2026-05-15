import type { TraceableEvent } from '@shared/events';
import type { SynthesisKind } from '@shared/synthesis';
import { eventReplayBus } from '../events/bus';
import { createSynthesisStore } from './store';

const NOTE_EVENTS = new Set(['note.updated', 'note.deleted', 'note.archived']);
const LIBRARY_EVENTS = new Set(['library.item.annotated', 'library.item.status_changed', 'library.item.read']);
const RESOURCE_EVENTS = new Set(['resource.ref.linked', 'resource.updated', 'resource.engagement']);

export function registerSynthesisInvalidator(getVaultPath: () => string | null): void {
  eventReplayBus.on('event', (event: TraceableEvent) => {
    const vaultPath = getVaultPath();
    if (!vaultPath) return;
    const kind = event.kind ?? event.type;
    const store = createSynthesisStore(vaultPath);
    if (NOTE_EVENTS.has(kind)) {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const noteId = typeof payload['note_id'] === 'string' ? payload['note_id'] : undefined;
      if (noteId) void store.markStale(`entity:note:${noteId}`, kind);
      if (noteId) void store.markStale(`relate:note:${noteId}`, kind);
      void markMatching(store, 'emerge.resource', kind);
    } else if (LIBRARY_EVENTS.has(kind)) {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const itemId = typeof payload['item_id'] === 'string' ? payload['item_id'] : undefined;
      if (itemId) void store.markStale(`library:${itemId}`, kind);
    } else if (RESOURCE_EVENTS.has(kind)) {
      void markMatching(store, 'summary.entity', kind);
    }
  });
}

async function markMatching(
  store: ReturnType<typeof createSynthesisStore>,
  kind: SynthesisKind,
  reason: string
): Promise<void> {
  const artifacts = await store.list({ kind, status: 'fresh', limit: 500 });
  await Promise.all(artifacts.map((artifact) => store.markStale(artifact.scope_key, reason)));
}
