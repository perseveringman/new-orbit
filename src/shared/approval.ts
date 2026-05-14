import { z } from 'zod';
import { TASK_EXECUTION_MODES, TASK_STATUSES } from './schemas';

export const PROPOSAL_TYPES = [
  'new_task',
  'planner_publish',
  'scope_expansion',
  'task_split',
  'merge',
  'archive_project',
  'external_path_access'
] as const;
export type ProposalType = (typeof PROPOSAL_TYPES)[number];

export const PROPOSAL_STATUSES = ['pending', 'approved', 'rejected', 'dismissed'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export type ProposalResolutionStatus = Exclude<ProposalStatus, 'pending'>;

export const PROPOSAL_SUBMITTERS = ['agent', 'user'] as const;
export type ProposalSubmitter = (typeof PROPOSAL_SUBMITTERS)[number];

export const PROPOSAL_RESOLUTION_SOURCES = ['chat', 'inbox', 'cli'] as const;
export type ProposalResolutionSource = (typeof PROPOSAL_RESOLUTION_SOURCES)[number];

export const PROPOSAL_INBOX_SUBTYPES = {
  new_task: 'A2',
  planner_publish: 'A3',
  scope_expansion: 'A4',
  task_split: 'A4',
  merge: 'A1',
  archive_project: 'D2',
  external_path_access: 'A4'
} as const satisfies Record<ProposalType, 'A1' | 'A2' | 'A3' | 'A4' | 'D2'>;

export const ProposalStatusSchema = z.enum(PROPOSAL_STATUSES);
export const ProposalResolutionStatusSchema = z.enum(['approved', 'rejected', 'dismissed']);
export const ProposalTypeSchema = z.enum(PROPOSAL_TYPES);
export const ProposalSubmitterSchema = z.enum(PROPOSAL_SUBMITTERS);
export const ProposalResolutionSourceSchema = z.enum(PROPOSAL_RESOLUTION_SOURCES);

const JsonObjectSchema = z.record(z.string(), z.unknown());

export const NewTaskProposalPayloadSchema = z
  .object({
    project_uid: z.string().min(1).optional(),
    area_uid: z.string().min(1).optional(),
    resource_uid: z.string().min(1).optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    uid: z.string().min(1).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    execution_mode: z.enum(TASK_EXECUTION_MODES).optional(),
    conversation_id: z.string().min(1).optional(),
    frontmatter: JsonObjectSchema.optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    const ownerCount = [value.project_uid, value.area_uid, value.resource_uid].filter(Boolean).length;
    if (ownerCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'new_task payload requires project_uid, area_uid, or resource_uid'
      });
    }
    if (ownerCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'new_task payload must set exactly one owner'
      });
    }
  });
export type NewTaskProposalPayload = z.infer<typeof NewTaskProposalPayloadSchema>;

export const ProposalSchema = z
  .object({
    id: z.string().min(1),
    type: ProposalTypeSchema,
    status: ProposalStatusSchema,
    submitted_by: ProposalSubmitterSchema,
    submitted_at: z.string().min(1),
    submitted_by_agent_run: z.string().min(1).optional(),
    submitted_during_task: z.string().min(1).optional(),
    subject: z.string().min(1),
    payload: z.unknown(),
    resolved_at: z.string().min(1).optional(),
    resolved_by: z.literal('user').optional(),
    resolution_note: z.string().optional(),
    resolution_source: ProposalResolutionSourceSchema.optional(),
    inbox_item_id: z.string().min(1).optional(),
    chat_card_id: z.string().min(1).optional(),
    result: z.unknown().optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    const parsedPayload = parseProposalPayloadResult(value.type, value.payload);
    if (!parsedPayload.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: proposalPayloadErrorMessage(parsedPayload.error),
        path: ['payload']
      });
    }
    if (
      value.type === 'new_task' &&
      value.submitted_by === 'agent' &&
      !value.submitted_by_agent_run
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'agent-submitted new_task proposals require submitted_by_agent_run',
        path: ['submitted_by_agent_run']
      });
    }
    if (value.status === 'pending') {
      if (value.resolved_at || value.resolved_by || value.resolution_source) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'pending proposals must not contain resolution fields'
        });
      }
      return;
    }
    if (!value.resolved_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'resolved proposals require resolved_at',
        path: ['resolved_at']
      });
    }
    if (!value.resolved_by) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'resolved proposals require resolved_by',
        path: ['resolved_by']
      });
    }
    if (!value.resolution_source) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'resolved proposals require resolution_source',
        path: ['resolution_source']
      });
    }
  });
export type Proposal = z.infer<typeof ProposalSchema>;

export const ProposalSubmitInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    type: ProposalTypeSchema,
    submitted_by: ProposalSubmitterSchema.default('agent'),
    submitted_at: z.string().min(1).optional(),
    submitted_by_agent_run: z.string().min(1).optional(),
    submitted_during_task: z.string().min(1).optional(),
    subject: z.string().min(1),
    payload: z.unknown()
  })
  .strict()
  .superRefine((value, ctx) => {
    const parsedPayload = parseProposalPayloadResult(value.type, value.payload);
    if (!parsedPayload.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: proposalPayloadErrorMessage(parsedPayload.error),
        path: ['payload']
      });
    }
    if (
      value.type === 'new_task' &&
      value.submitted_by === 'agent' &&
      !value.submitted_by_agent_run
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'agent-submitted new_task proposals require submitted_by_agent_run',
        path: ['submitted_by_agent_run']
      });
    }
  });
export type ProposalSubmitInput = z.input<typeof ProposalSubmitInputSchema>;

export const ProposalResolveInputSchema = z
  .object({
    status: ProposalResolutionStatusSchema,
    resolved_by: z.literal('user').default('user'),
    resolved_at: z.string().min(1).optional(),
    resolution_note: z.string().optional(),
    resolution_source: ProposalResolutionSourceSchema.default('inbox')
  })
  .strict();
export type ProposalResolveInput = z.input<typeof ProposalResolveInputSchema>;

export interface ProposalListFilter {
  status?: ProposalStatus;
  type?: ProposalType;
  includeArchived?: boolean;
}

export interface ProposalSyncSnapshot {
  proposal_id: string;
  status: ProposalStatus;
  inbox_item_id: string;
  chat_card_id: string;
  inbox_subtype: (typeof PROPOSAL_INBOX_SUBTYPES)[ProposalType];
  inbox_status: 'pending' | 'resolved' | 'dismissed';
}

export function parseProposalPayload(
  type: ProposalType,
  payload: unknown
): NewTaskProposalPayload | Record<string, unknown> {
  const result = parseProposalPayloadResult(type, payload);
  if (!result.success) throw result.error;
  return result.data;
}

type ProposalPayloadParseResult =
  | { success: true; data: NewTaskProposalPayload | Record<string, unknown> }
  | { success: false; error: z.ZodError };

function parseProposalPayloadResult(
  type: ProposalType,
  payload: unknown
): ProposalPayloadParseResult {
  if (type === 'new_task') return NewTaskProposalPayloadSchema.safeParse(payload);
  return JsonObjectSchema.safeParse(payload);
}

function proposalPayloadErrorMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join('; ');
}
