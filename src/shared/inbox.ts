import { z } from 'zod';
import type { ActivityActor } from './activity';

export const INBOX_CATEGORIES = ['message', 'capture'] as const;
export type InboxCategory = (typeof INBOX_CATEGORIES)[number];

export const INBOX_MESSAGE_SUBTYPES = [
  'A1',
  'A2',
  'A3',
  'A4',
  'B1',
  'B2',
  'B3',
  'C1',
  'C2',
  'C3',
  'D1',
  'D2',
  'D3'
] as const;
export type InboxMessageSubtype = (typeof INBOX_MESSAGE_SUBTYPES)[number];

export const INBOX_CAPTURE_SUBTYPES = ['feed_item', 'library_article', 'thought'] as const;
export type InboxCaptureSubtype = (typeof INBOX_CAPTURE_SUBTYPES)[number];
export type InboxSubtype = InboxMessageSubtype | InboxCaptureSubtype;

export const INBOX_STATUSES = [
  'pending',
  'unread',
  'reading',
  'read',
  'resolved',
  'processed',
  'dismissed',
  'archived'
] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];

export const INBOX_RESOLUTION_SOURCES = ['chat', 'inbox', 'cli'] as const;
export type InboxResolutionSource = (typeof INBOX_RESOLUTION_SOURCES)[number];

export const INBOX_RESOLVE_DECISIONS = ['approve', 'reject', 'done', 'processed'] as const;
export type InboxResolveDecision = (typeof INBOX_RESOLVE_DECISIONS)[number];

export const InboxCategorySchema = z.enum(INBOX_CATEGORIES);
export const InboxMessageSubtypeSchema = z.enum(INBOX_MESSAGE_SUBTYPES);
export const InboxCaptureSubtypeSchema = z.enum(INBOX_CAPTURE_SUBTYPES);
export const InboxStatusSchema = z.enum(INBOX_STATUSES);
export const InboxResolutionSourceSchema = z.enum(INBOX_RESOLUTION_SOURCES);
export const InboxResolveDecisionSchema = z.enum(INBOX_RESOLVE_DECISIONS);

export const InboxContextSchema = z
  .object({
    project_uid: z.string().min(1).optional(),
    task_uid: z.string().min(1).optional(),
    run_id: z.string().min(1).optional(),
    area_uid: z.string().min(1).optional(),
    resource_uid: z.string().min(1).optional(),
    proposal_id: z.string().min(1).optional(),
    feed_subscription_id: z.string().min(1).optional(),
    library_id: z.string().min(1).optional(),
    thought_id: z.string().min(1).optional()
  })
  .catchall(z.string().optional());
export type InboxContext = z.infer<typeof InboxContextSchema>;

export const FeedItemPayloadSchema = z
  .object({
    subscription_id: z.string().min(1),
    article_url: z.string().min(1),
    article_title: z.string().min(1),
    article_excerpt: z.string(),
    published_at: z.string().min(1),
    source: z.string().min(1),
    guid: z.string().min(1).optional(),
    image_url: z.string().min(1).optional()
  })
  .strict();
export type FeedItemPayload = z.infer<typeof FeedItemPayloadSchema>;

export const LibraryArticlePayloadSchema = z
  .object({
    url: z.string().min(1),
    title: z.string().min(1),
    author: z.string().min(1).optional(),
    published_at: z.string().min(1).optional(),
    source: z.enum(['manual', 'feed_upgrade', 'quick_capture', 'share']),
    source_note: z.string().optional(),
    origin_feed_subscription_id: z.string().min(1).optional(),
    origin_feed_item_id: z.string().min(1).optional(),
    content_path: z.string().min(1).optional(),
    estimated_reading_minutes: z.number().int().nonnegative().default(0),
    scroll_position: z.number().nonnegative().optional(),
    reading_started_at: z.string().min(1).optional(),
    total_reading_seconds: z.number().int().nonnegative().default(0),
    last_read_at: z.string().min(1).optional()
  })
  .strict();
export type LibraryArticlePayload = z.infer<typeof LibraryArticlePayloadSchema>;

export const ThoughtPayloadSchema = z
  .object({
    content: z.string(),
    tags: z.array(z.string()).default([]),
    created_from: z.enum(['quick_capture', 'manual', 'voice', 'agent']).default('manual')
  })
  .strict();
export type ThoughtPayload = z.infer<typeof ThoughtPayloadSchema>;

export const InboxItemSchema = z
  .object({
    id: z.string().min(1),
    category: InboxCategorySchema,
    subtype: z.union([InboxMessageSubtypeSchema, InboxCaptureSubtypeSchema]),
    title: z.string().min(1),
    summary: z.string(),
    context: InboxContextSchema.default({}),
    payload: z.unknown(),
    status: InboxStatusSchema,
    created_at: z.string().min(1),
    updated_at: z.string().min(1),
    resolved_at: z.string().min(1).optional(),
    resolved_by: z.enum(['user', 'agent']).optional(),
    resolution_source: InboxResolutionSourceSchema.optional(),
    resolution_note: z.string().optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.category === 'message') {
      if (!isInboxMessageSubtype(value.subtype)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'message items require A/B/C/D subtype', path: ['subtype'] });
      }
      if (!['pending', 'resolved', 'dismissed', 'archived'].includes(value.status)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `invalid message status: ${value.status}`, path: ['status'] });
      }
      return;
    }

    if (!isInboxCaptureSubtype(value.subtype)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'capture items require capture subtype', path: ['subtype'] });
      return;
    }

    const allowed = captureStatusesForSubtype(value.subtype);
    if (!allowed.includes(value.status)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `invalid ${value.subtype} status: ${value.status}`, path: ['status'] });
    }

    const payloadResult = parseCapturePayload(value.subtype, value.payload);
    if (!payloadResult.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: payloadResult.error.issues.map((issue) => issue.message).join('; '), path: ['payload'] });
    }
  });
export type InboxItem = z.infer<typeof InboxItemSchema>;

export const InboxMessageInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    subtype: InboxMessageSubtypeSchema,
    title: z.string().min(1),
    summary: z.string().default(''),
    context: InboxContextSchema.optional(),
    payload: z.unknown().default({}),
    actor: z.enum(['user', 'agent', 'system']).optional(),
    created_at: z.string().min(1).optional()
  })
  .strict();
export type InboxMessageInput = z.input<typeof InboxMessageInputSchema>;

export const InboxCaptureInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    subtype: InboxCaptureSubtypeSchema,
    title: z.string().min(1),
    summary: z.string().default(''),
    context: InboxContextSchema.optional(),
    payload: z.unknown(),
    status: InboxStatusSchema.optional(),
    actor: z.enum(['user', 'agent', 'system']).optional(),
    created_at: z.string().min(1).optional()
  })
  .strict();
export type InboxCaptureInput = z.input<typeof InboxCaptureInputSchema>;

export const InboxResolveInputSchema = z
  .object({
    decision: InboxResolveDecisionSchema.default('done'),
    source: InboxResolutionSourceSchema.default('inbox'),
    note: z.string().optional(),
    resolved_by: z.enum(['user', 'agent']).default('user'),
    resolved_at: z.string().min(1).optional()
  })
  .strict();
export type InboxResolveInput = z.input<typeof InboxResolveInputSchema>;

export const InboxDismissInputSchema = z
  .object({
    source: InboxResolutionSourceSchema.default('inbox'),
    note: z.string().optional(),
    resolved_by: z.enum(['user', 'agent']).default('user'),
    resolved_at: z.string().min(1).optional()
  })
  .strict();
export type InboxDismissInput = z.input<typeof InboxDismissInputSchema>;

export interface InboxListFilter {
  category?: InboxCategory;
  subtype?: InboxSubtype;
  status?: InboxStatus;
  includeArchived?: boolean;
}

export interface InboxCountSummary {
  sidebarMessagesPending: number;
  messagesPending: number;
  captureLibraryUnread: number;
  feedCount: 0;
}

export interface InboxListResult {
  items: InboxItem[];
  counts: InboxCountSummary;
}

export interface InboxEvent {
  type: 'created' | 'updated' | 'resolved' | 'dismissed' | 'archived';
  item: InboxItem;
}

export function summarizeInboxCounts(items: readonly InboxItem[]): InboxCountSummary {
  const messagesPending = items.filter(
    (item) => item.category === 'message' && item.status === 'pending'
  ).length;
  return {
    sidebarMessagesPending: messagesPending,
    messagesPending,
    captureLibraryUnread: items.filter(
      (item) =>
        item.category === 'capture' && item.subtype === 'library_article' && item.status === 'unread'
    ).length,
    feedCount: 0
  };
}

export function isInboxMessageSubtype(value: InboxSubtype): value is InboxMessageSubtype {
  return (INBOX_MESSAGE_SUBTYPES as readonly string[]).includes(value);
}

export function isInboxCaptureSubtype(value: InboxSubtype): value is InboxCaptureSubtype {
  return (INBOX_CAPTURE_SUBTYPES as readonly string[]).includes(value);
}

export function defaultCaptureStatus(subtype: InboxCaptureSubtype): InboxStatus {
  if (subtype === 'library_article') return 'unread';
  return 'pending';
}

export function captureStatusesForSubtype(subtype: InboxCaptureSubtype): InboxStatus[] {
  if (subtype === 'library_article') return ['unread', 'reading', 'read', 'processed', 'dismissed', 'archived'];
  if (subtype === 'thought') return ['pending', 'processed', 'dismissed', 'archived'];
  return ['pending', 'dismissed', 'archived'];
}

export function activityActorForInboxInput(actor: ActivityActor | undefined): ActivityActor {
  return actor ?? 'user';
}

function parseCapturePayload(
  subtype: InboxCaptureSubtype,
  payload: unknown
): { success: true } | { success: false; error: z.ZodError } {
  const result =
    subtype === 'feed_item'
      ? FeedItemPayloadSchema.safeParse(payload)
      : subtype === 'library_article'
        ? LibraryArticlePayloadSchema.safeParse(payload)
        : ThoughtPayloadSchema.safeParse(payload);
  if (result.success) return { success: true };
  return { success: false, error: result.error };
}
