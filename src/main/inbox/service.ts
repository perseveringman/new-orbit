import { randomUUID } from 'node:crypto';
import type { ActivityEventInput } from '../activity';
import { emitActivity } from '../activity';
import { createInboxStore, type InboxStore } from './store';
import {
  InboxCaptureInputSchema,
  InboxDismissInputSchema,
  InboxItemSchema,
  InboxMessageInputSchema,
  InboxResolveInputSchema,
  activityActorForInboxInput,
  defaultCaptureStatus,
  isInboxCaptureSubtype,
  type InboxCaptureInput,
  type InboxDismissInput,
  type InboxEvent,
  type InboxItem,
  type InboxListFilter,
  type InboxListResult,
  type InboxMessageInput,
  type InboxResolveInput,
  type InboxStatus
} from './types';

export type InboxActivityEmitter = (input: ActivityEventInput) => unknown;
export type InboxEventListener = (event: InboxEvent) => void;

export interface InboxServiceOptions {
  now?: () => Date;
  id?: () => string;
  emitActivity?: InboxActivityEmitter;
  onEvent?: InboxEventListener;
}

export class InboxService {
  private readonly now: () => Date;
  private readonly id: () => string;
  private readonly activity: InboxActivityEmitter;
  private readonly onEvent?: InboxEventListener;

  constructor(
    private readonly store: InboxStore,
    options: InboxServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? (() => `inbox_${randomUUID()}`);
    this.activity = options.emitActivity ?? emitActivity;
    this.onEvent = options.onEvent;
  }

  async emitMessage(input: InboxMessageInput): Promise<InboxItem> {
    const parsed = InboxMessageInputSchema.parse(input);
    const createdAt = parsed.created_at ?? this.now().toISOString();
    const item = InboxItemSchema.parse({
      id: parsed.id ?? this.id(),
      category: 'message',
      subtype: parsed.subtype,
      title: parsed.title,
      summary: parsed.summary,
      context: parsed.context ?? {},
      payload: parsed.payload,
      status: 'pending',
      created_at: createdAt,
      updated_at: createdAt
    });
    const stored = await this.store.add(item);
    this.emitActivityForCreate(stored, activityActorForInboxInput(parsed.actor));
    this.onEvent?.({ type: 'created', item: stored });
    return stored;
  }

  async emitCapture(input: InboxCaptureInput): Promise<InboxItem> {
    const parsed = InboxCaptureInputSchema.parse(input);
    const createdAt = parsed.created_at ?? this.now().toISOString();
    const item = InboxItemSchema.parse({
      id: parsed.id ?? this.id(),
      category: 'capture',
      subtype: parsed.subtype,
      title: parsed.title,
      summary: parsed.summary,
      context: parsed.context ?? {},
      payload: parsed.payload,
      status: parsed.status ?? defaultCaptureStatus(parsed.subtype),
      created_at: createdAt,
      updated_at: createdAt
    });
    const stored = await this.store.add(item);
    this.emitActivityForCreate(stored, activityActorForInboxInput(parsed.actor));
    this.onEvent?.({ type: 'created', item: stored });
    return stored;
  }

  async resolve(id: string, input: InboxResolveInput = {}): Promise<InboxItem> {
    const current = await this.requirePending(id);
    const parsed = InboxResolveInputSchema.parse(input);
    const resolvedAt = parsed.resolved_at ?? this.now().toISOString();
    const nextStatus = resolvedStatusFor(current);
    const next = InboxItemSchema.parse({
      ...current,
      status: nextStatus,
      updated_at: resolvedAt,
      resolved_at: resolvedAt,
      resolved_by: parsed.resolved_by,
      resolution_source: parsed.source,
      ...(parsed.note ? { resolution_note: parsed.note } : {})
    });
    const stored = await this.store.resolve(id, next);
    this.emitActivityForResolution(stored, false);
    this.onEvent?.({ type: 'resolved', item: stored });
    return stored;
  }

  async dismiss(id: string, input: InboxDismissInput = {}): Promise<InboxItem> {
    const current = await this.requirePending(id);
    const parsed = InboxDismissInputSchema.parse(input);
    const resolvedAt = parsed.resolved_at ?? this.now().toISOString();
    const next = InboxItemSchema.parse({
      ...current,
      status: 'dismissed',
      updated_at: resolvedAt,
      resolved_at: resolvedAt,
      resolved_by: parsed.resolved_by,
      resolution_source: parsed.source,
      ...(parsed.note ? { resolution_note: parsed.note } : {})
    });
    const stored = await this.store.dismiss(id, next);
    this.emitActivityForResolution(stored, true);
    this.onEvent?.({ type: 'dismissed', item: stored });
    return stored;
  }

  async archive(id: string): Promise<InboxItem> {
    const item = await this.store.archive(id, this.now().toISOString());
    this.onEvent?.({ type: 'archived', item });
    return item;
  }

  async list(filter?: InboxListFilter): Promise<InboxListResult> {
    return this.store.list(filter);
  }

  async get(id: string): Promise<InboxItem | null> {
    return this.store.get(id);
  }

  private async requirePending(id: string): Promise<InboxItem> {
    const item = await this.store.get(id);
    if (!item) throw new Error(`inbox item not found: ${id}`);
    if (['resolved', 'processed', 'dismissed', 'archived'].includes(item.status)) {
      throw new Error(`cannot update inbox item ${id}: already ${item.status}`);
    }
    return item;
  }

  private emitActivityForCreate(item: InboxItem, actor: ActivityEventInput['actor']): void {
    this.activity({
      actor,
      action: createActionFor(item),
      context: activityContextFor(item),
      payload: createPayloadFor(item),
      summary:
        item.category === 'message'
          ? `Inbox message created: ${item.title}`
          : `Capture saved: ${item.title}`
    });
  }

  private emitActivityForResolution(item: InboxItem, dismissed: boolean): void {
    this.activity({
      actor: item.resolved_by ?? 'user',
      action: resolutionActionFor(item, dismissed),
      context: activityContextFor(item),
      payload: { subtype: item.subtype, title: item.title, status: item.status },
      summary: dismissed ? `Dismissed inbox item: ${item.title}` : `Resolved inbox item: ${item.title}`
    });
  }
}

export function createInboxService(store: InboxStore, options?: InboxServiceOptions): InboxService {
  return new InboxService(store, options);
}

export function createInboxServiceForVault(
  vaultPath: string,
  options?: InboxServiceOptions
): InboxService {
  return new InboxService(createInboxStore(vaultPath), options);
}

function resolvedStatusFor(item: InboxItem): InboxStatus {
  if (item.category === 'message') return 'resolved';
  if (item.subtype === 'library_article' || item.subtype === 'thought') return 'processed';
  return 'archived';
}

function createActionFor(item: InboxItem): ActivityEventInput['action'] {
  if (item.category === 'message') return 'inbox.message_created';
  if (item.subtype === 'library_article') return 'library.article_saved';
  if (item.subtype === 'thought') return 'thought.created';
  return 'feed.item_saved';
}

function resolutionActionFor(item: InboxItem, dismissed: boolean): ActivityEventInput['action'] {
  if (item.category === 'message') return dismissed ? 'inbox.message_dismissed' : 'inbox.message_resolved';
  if (dismissed) {
    if (item.subtype === 'library_article') return 'library.article_dismissed';
    if (item.subtype === 'thought') return 'thought.dismissed';
    return 'inbox.capture_dismissed';
  }
  return 'inbox.capture_processed';
}

function activityContextFor(item: InboxItem): ActivityEventInput['context'] {
  return {
    ...item.context,
    inbox_item_id: item.id,
    ...(item.context.proposal_id ? { proposal_id: item.context.proposal_id } : {}),
    ...(item.subtype === 'library_article' ? { library_id: item.id } : {}),
    ...(item.subtype === 'thought' ? { thought_id: item.id } : {})
  };
}

function createPayloadFor(item: InboxItem): unknown {
  if (item.category === 'message') {
    return { subtype: item.subtype, title: item.title };
  }
  if (!isInboxCaptureSubtype(item.subtype)) return { subtype: item.subtype };
  return { subtype: item.subtype, title: item.title };
}
