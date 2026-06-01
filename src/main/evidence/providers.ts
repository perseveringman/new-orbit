import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ActivityEvent } from '@shared/activity';
import type { AreaConfig } from '@shared/area';
import type { Conversation, ConversationScope } from '@shared/conversation';
import type {
  EvidenceContentView,
  EvidenceExcerpt,
  EvidenceFingerprint,
  EvidencePrivacy,
  EvidenceReadResult,
  EvidenceScopeRef,
  EvidenceSelector,
  EvidenceSource,
  EvidenceSourceKind,
  SourceListInput,
  SourceProvider
} from '@shared/evidence';
import { EVIDENCE_SOURCE_KINDS, evidenceSourceId } from '@shared/evidence';
import type { KnowledgeBase } from '@shared/knowledge-base';
import type { LibraryItem } from '@shared/library';
import type { Note } from '@shared/note';
import type { ResourceSummary } from '@shared/resource';
import type { TaskRecord } from '@shared/schemas';
import type { SemanticDocument } from '@shared/semantic';
import { queryActivities } from '../activity/query';
import { listAreas } from '../area';
import { ConversationStore } from '../conversation/store';
import { KnowledgeBaseStore } from '../knowledge-base/store';
import { createLibraryStore } from '../library/store';
import { createNoteStore } from '../note/store';
import { listConnectorEvidenceSources, readConnectorEvidenceText } from '../connectors/evidence';
import { toPosix, vaultRel } from '../pathGuard';
import { listProjects, type ProjectSummary } from '../project';
import { createResourceStore } from '../resource/store';
import { tasksOfFile } from '../tasks';
import { walkMarkdown } from '../walk';
import {
  EXTERNAL_AI_SESSION_PROVIDER_ID,
  listExternalAISessionSources,
  readExternalAISessionSourceText,
  type ExternalAISessionRoot
} from './external-ai-sessions';
import { resolveExternalAISessionScanOptions } from './external-ai-session-settings';
import { createEvidenceStore } from './store';

export const ORBIT_EVIDENCE_PROVIDER_ID = 'orbit.local';

interface CollectOrbitEvidenceOptions {
  includeActivities?: boolean;
  activityLimit?: number;
  includeExternalAISessions?: boolean;
  externalAISessionLimit?: number;
  externalAISessionRoots?: ExternalAISessionRoot[];
}

interface SourceInput {
  kind: EvidenceSourceKind;
  ref: string;
  title: string;
  canonicalRef: string;
  updatedAt: string;
  observedAt: string;
  createdAt?: string;
  summary?: string;
  scopeRefs?: EvidenceScopeRef[];
  fingerprintParts: unknown[];
  contentSize?: number;
  metadata?: Record<string, unknown>;
  privacy?: EvidencePrivacy;
  timeRange?: { from?: string; to?: string };
}

export async function collectOrbitEvidenceSources(
  vaultPath: string,
  options: CollectOrbitEvidenceOptions = {}
): Promise<EvidenceSource[]> {
  const includeActivities = options.includeActivities ?? true;
  const includeExternalAISessions = options.includeExternalAISessions ?? false;
  const [notes, libraryItems, resources, projects, areas, conversations, tasks, activities, kbDocs, connectorSources, externalAISessions] = await Promise.all([
    createNoteStore(vaultPath).list({ include_archived: true }),
    createLibraryStore(vaultPath).list({ include_archived: true }),
    createResourceStore(vaultPath).list({ include_archived: true }),
    listProjects(vaultPath),
    listAreas(vaultPath, { includeArchived: true }),
    listConversations(vaultPath),
    listTaskRecords(vaultPath),
    includeActivities ? queryActivities(vaultPath, { limit: Math.max(1, options.activityLimit ?? 500) }) : Promise.resolve([]),
    listKnowledgeBaseDocSources(vaultPath),
    listConnectorEvidenceSources(vaultPath),
    includeExternalAISessions
      ? resolveExternalAISessionScanOptions(vaultPath, options).then((scanOptions) => listExternalAISessionSources(scanOptions))
      : Promise.resolve([])
  ]);

  return [
    ...notes.map(noteSource),
    ...libraryItems.map(libraryItemSource),
    ...resources.map(resourceSource),
    ...projects.map(projectSource),
    ...areas.map(areaSource),
    ...conversations.map(conversationSource),
    ...tasks.map(taskSource),
    ...activities.map(activitySource),
    ...kbDocs,
    ...connectorSources,
    ...externalAISessions
  ];
}

export async function syncOrbitEvidenceSources(
  vaultPath: string,
  options: CollectOrbitEvidenceOptions = {}
): Promise<EvidenceSource[]> {
  const sources = await collectOrbitEvidenceSources(vaultPath, options);
  const orbitSources = sources.filter((source) => source.provider_id === ORBIT_EVIDENCE_PROVIDER_ID);
  const externalAISessions = sources.filter((source) => source.provider_id === EXTERNAL_AI_SESSION_PROVIDER_ID);
  await createEvidenceStore(vaultPath).replaceProviderSources(ORBIT_EVIDENCE_PROVIDER_ID, orbitSources);
  if (externalAISessions.length || options.includeExternalAISessions) {
    await createEvidenceStore(vaultPath).replaceProviderSources(EXTERNAL_AI_SESSION_PROVIDER_ID, externalAISessions);
  }
  return sources;
}

export function createOrbitEvidenceProvider(vaultPath: string): SourceProvider {
  return {
    id: ORBIT_EVIDENCE_PROVIDER_ID,
    kind: 'note',
    kinds: EVIDENCE_SOURCE_KINDS,
    async list(input: SourceListInput = {}) {
      const sources = await collectOrbitEvidenceSources(vaultPath, {
        includeActivities: true,
        activityLimit: input.limit ?? 500
      });
      return sources.filter((source) => sourceMatchesListInput(source, input)).slice(0, Math.max(1, input.limit ?? 500));
    },
    async get(sourceId: string) {
      const sources = await collectOrbitEvidenceSources(vaultPath, { includeActivities: true });
      return sources.find((source) => source.id === sourceId) ?? createEvidenceStore(vaultPath).get(sourceId);
    },
    async read(selector: EvidenceSelector): Promise<EvidenceReadResult> {
      const sources = await collectOrbitEvidenceSources(vaultPath, { includeActivities: true });
      const source = sources.find((candidate) => candidate.id === selector.source_id)
        ?? await createEvidenceStore(vaultPath).get(selector.source_id);
      if (!source) throw new Error(`evidence_source_not_found:${selector.source_id}`);
      const text = await readOrbitSourceText(vaultPath, source, selector.content_view, selector);
      const excerpt: EvidenceExcerpt = {
        selector,
        source,
        title: source.title,
        text,
        redacted: selector.content_view !== 'full'
      };
      return {
        source,
        excerpts: text.trim() ? [excerpt] : [],
        availability: source.availability
      };
    },
    async fingerprint(source: EvidenceSource): Promise<EvidenceFingerprint> {
      return source.fingerprint;
    }
  };
}

export function evidenceForSemanticDocument(doc: Pick<SemanticDocument, 'entity_kind' | 'entity_ref'>): {
  source_id: string;
  evidence_selectors: EvidenceSelector[];
} | null {
  const kind = semanticKindToEvidenceKind(doc.entity_kind);
  if (!kind) return null;
  const sourceId = evidenceSourceId(kind, doc.entity_ref);
  return {
    source_id: sourceId,
    evidence_selectors: [
      {
        source_id: sourceId,
        kind: 'whole_source',
        content_view: 'safe_projection',
        reason: 'semantic projection'
      }
    ]
  };
}

export function semanticKindToEvidenceKind(kind: SemanticDocument['entity_kind']): EvidenceSourceKind | null {
  if (kind === 'synthesis_artifact') return null;
  return kind;
}

function noteSource(note: Note): EvidenceSource {
  return makeSource({
    kind: 'note',
    ref: note.frontmatter.id,
    title: note.frontmatter.title ?? note.path,
    canonicalRef: note.path,
    createdAt: note.frontmatter.created,
    updatedAt: note.frontmatter.updated,
    observedAt: new Date().toISOString(),
    summary: excerpt(note.body),
    scopeRefs: [
      { kind: 'note', ref: note.frontmatter.id },
      ...scopeRefsForAreas(note.frontmatter.areas?.map((area) => area.area_slug)),
      ...scopeRefsForResources(note.frontmatter.resource_refs),
      ...(note.frontmatter.para_kind === 'project' && note.frontmatter.para_ref ? [{ kind: 'project' as const, ref: note.frontmatter.para_ref }] : [])
    ],
    fingerprintParts: [note.frontmatter, note.body],
    contentSize: byteSize(note.body),
    metadata: compactMetadata({
      entity_ref: note.frontmatter.id,
      path: note.path,
      type: note.frontmatter.type,
      visibility: note.frontmatter.visibility
    }),
    privacy: note.frontmatter.visibility === 'private' ? privatePrivacy() : orbitOwnedPrivacy()
  });
}

function libraryItemSource(item: LibraryItem): EvidenceSource {
  const content = [item.frontmatter.url, item.frontmatter.local_path, item.body].filter(Boolean).join('\n\n');
  return makeSource({
    kind: 'library_item',
    ref: item.frontmatter.id,
    title: item.frontmatter.title,
    canonicalRef: item.path,
    createdAt: item.frontmatter.created,
    updatedAt: item.frontmatter.updated,
    observedAt: new Date().toISOString(),
    summary: excerpt(content),
    scopeRefs: [
      { kind: 'library', ref: item.frontmatter.id },
      ...scopeRefsForAreas(item.frontmatter.areas?.map((area) => area.area_slug)),
      ...scopeRefsForResources(item.frontmatter.resource_refs)
    ],
    fingerprintParts: [item.frontmatter, item.body],
    contentSize: byteSize(content),
    metadata: compactMetadata({
      entity_ref: item.frontmatter.id,
      path: item.path,
      kind: item.frontmatter.kind,
      url: item.frontmatter.url,
      local_path: item.frontmatter.local_path,
      status: item.frontmatter.status
    })
  });
}

function resourceSource(resource: ResourceSummary): EvidenceSource {
  return makeSource({
    kind: 'resource',
    ref: resource.frontmatter.slug,
    title: resource.frontmatter.title,
    canonicalRef: resource.path,
    createdAt: resource.frontmatter.created,
    updatedAt: resource.frontmatter.updated,
    observedAt: new Date().toISOString(),
    summary: `${resource.frontmatter.status} / ${resource.frontmatter.depth}`,
    scopeRefs: [
      { kind: 'resource', ref: resource.frontmatter.slug },
      ...scopeRefsForAreas(resource.frontmatter.areas?.map((area) => area.area_slug))
    ],
    fingerprintParts: [resource.frontmatter, resource.counts],
    metadata: compactMetadata({
      entity_ref: resource.frontmatter.slug,
      resource_id: resource.frontmatter.id,
      path: resource.path,
      status: resource.frontmatter.status,
      depth: resource.frontmatter.depth
    })
  });
}

function projectSource(project: ProjectSummary): EvidenceSource {
  const ref = project.uid || project.slug;
  return makeSource({
    kind: 'project',
    ref,
    title: project.name,
    canonicalRef: project.relPath,
    createdAt: project.created_at,
    updatedAt: project.archived_at ?? project.created_at ?? new Date(0).toISOString(),
    observedAt: new Date().toISOString(),
    summary: project.description,
    scopeRefs: [
      { kind: 'project', ref },
      ...scopeRefsForAreas(project.area_slugs)
    ],
    fingerprintParts: [project.uid, project.slug, project.name, project.description, project.status, project.tags, project.area_slugs],
    metadata: compactMetadata({
      entity_ref: ref,
      slug: project.slug,
      path: project.path,
      readme_path: project.readmePath,
      workdir_path: project.workdirPath,
      status: project.status,
      legacy: project.legacy
    })
  });
}

function areaSource(area: AreaConfig): EvidenceSource {
  return makeSource({
    kind: 'area',
    ref: area.slug,
    title: area.name,
    canonicalRef: area.slug,
    createdAt: area.created_at,
    updatedAt: area.updated_at,
    observedAt: new Date().toISOString(),
    summary: area.description,
    scopeRefs: [{ kind: 'area', ref: area.slug }],
    fingerprintParts: [area],
    metadata: compactMetadata({
      entity_ref: area.slug,
      uid: area.uid,
      slug: area.slug,
      status: area.status
    })
  });
}

function conversationSource(conversation: Conversation): EvidenceSource {
  const firstTurn = conversation.turns[0]?.at;
  const lastTurn = conversation.turns.at(-1)?.at;
  return makeSource({
    kind: 'conversation',
    ref: conversation.id,
    title: conversation.title ?? `Conversation ${conversation.id}`,
    canonicalRef: `conversation:${conversation.id}`,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    observedAt: new Date().toISOString(),
    summary: conversation.summary ?? excerpt(conversation.turns.map((turn) => `${turn.role}: ${turn.content}`).join('\n')),
    scopeRefs: scopeRefsForConversation(conversation.scope),
    fingerprintParts: [conversation.id, conversation.updatedAt, conversation.summary, conversation.turns],
    contentSize: byteSize(conversation.turns.map((turn) => turn.content).join('\n')),
    metadata: compactMetadata({
      entity_ref: conversation.id,
      scope: conversation.scope,
      status: conversation.status,
      runtime_hint: conversation.runtimeHint,
      runtime_model_hint: conversation.runtimeModelHint,
      turn_count: conversation.turns.length
    }),
    timeRange: firstTurn || lastTurn ? compactMetadata({ from: firstTurn, to: lastTurn }) as { from?: string; to?: string } : undefined
  });
}

function taskSource(task: TaskRecord): EvidenceSource {
  const ref = task.uid ?? task.id;
  return makeSource({
    kind: 'task',
    ref,
    title: task.title,
    canonicalRef: task.relPath,
    updatedAt: isoDateOrEpoch(task.due),
    observedAt: new Date().toISOString(),
    summary: task.status,
    scopeRefs: compactScopeRefs([
      { kind: 'task', ref },
      task.project_uid ? { kind: 'project', ref: task.project_uid } : undefined,
      task.area_uid ? { kind: 'area', ref: task.area_uid } : undefined,
      task.resource_uid ? { kind: 'resource', ref: task.resource_uid } : undefined
    ]),
    fingerprintParts: [task],
    metadata: compactMetadata({
      entity_ref: ref,
      task_id: task.id,
      uid: task.uid,
      path: task.filePath,
      rel_path: task.relPath,
      line: task.line,
      status: task.status,
      source: task.source
    })
  });
}

function activitySource(event: ActivityEvent): EvidenceSource {
  return makeSource({
    kind: 'activity_event',
    ref: event.id,
    title: event.summary,
    canonicalRef: `activity:${event.id}`,
    createdAt: event.at,
    updatedAt: event.at,
    observedAt: new Date().toISOString(),
    summary: event.action,
    scopeRefs: compactScopeRefs([
      event.context.project_uid ? { kind: 'project', ref: event.context.project_uid } : undefined,
      event.context.task_uid ? { kind: 'task', ref: event.context.task_uid } : undefined,
      event.context.area_uid ? { kind: 'area', ref: event.context.area_uid } : undefined,
      event.context.resource_uid ? { kind: 'resource', ref: event.context.resource_uid } : undefined,
      event.context.library_id ? { kind: 'library', ref: event.context.library_id } : undefined,
      event.context.thought_id ? { kind: 'note', ref: event.context.thought_id } : undefined
    ]),
    fingerprintParts: [event],
    metadata: compactMetadata({
      entity_ref: event.id,
      action: event.action,
      actor: event.actor,
      actor_id: event.actor_id,
      context: event.context
    }),
    timeRange: { from: event.at, to: event.at }
  });
}

export async function syncExternalAISessionEvidenceSources(
  vaultPath: string,
  options: Pick<CollectOrbitEvidenceOptions, 'externalAISessionLimit' | 'externalAISessionRoots'> = {}
): Promise<EvidenceSource[]> {
  const sources = await listExternalAISessionSources(await resolveExternalAISessionScanOptions(vaultPath, options));
  await createEvidenceStore(vaultPath).replaceProviderSources(EXTERNAL_AI_SESSION_PROVIDER_ID, sources);
  return sources;
}

async function listKnowledgeBaseDocSources(vaultPath: string): Promise<EvidenceSource[]> {
  const store = new KnowledgeBaseStore(vaultPath);
  const sources: EvidenceSource[] = [];
  for (const kb of await store.list().catch(() => [] as KnowledgeBase[])) {
    const root = path.join(vaultPath, kb.path);
    for await (const file of walkMarkdown(root)) {
      const raw = await fs.readFile(file, 'utf8').catch(() => '');
      const rel = toPosix(path.relative(vaultPath, file));
      const docRef = `${kb.id}/${rel.slice(kb.path.length + 1)}`;
      sources.push(makeSource({
        kind: 'kb_doc',
        ref: docRef,
        title: titleFromMarkdown(raw, rel),
        canonicalRef: rel,
        createdAt: kb.imported_at,
        updatedAt: kb.last_scanned_at ?? kb.imported_at,
        observedAt: new Date().toISOString(),
        summary: excerpt(raw),
        fingerprintParts: [kb.id, rel, raw],
        contentSize: byteSize(raw),
        metadata: compactMetadata({
          entity_ref: docRef,
          kb_id: kb.id,
          kb_name: kb.name,
          path: rel,
          source_type: kb.source_type,
          writable: kb.writable
        }),
        privacy: referencePrivacy('full_text')
      }));
    }
  }
  return sources;
}

async function listConversations(vaultPath: string): Promise<Conversation[]> {
  const store = new ConversationStore(vaultPath);
  const metas = await store.list();
  const conversations = await Promise.all(metas.filter((meta) => !meta.archived).map((meta) => store.get(meta.id)));
  return conversations.filter((conversation): conversation is Conversation => Boolean(conversation));
}

async function listTaskRecords(vaultPath: string): Promise<TaskRecord[]> {
  const tasks: TaskRecord[] = [];
  for await (const file of walkMarkdown(vaultPath)) {
    const raw = await fs.readFile(file, 'utf8').catch(() => '');
    const rel = toPosix(vaultRel(vaultPath, file));
    tasks.push(...tasksOfFile(file, rel, raw));
  }
  return tasks;
}

async function readOrbitSourceText(
  vaultPath: string,
  source: EvidenceSource,
  contentView: EvidenceContentView,
  selector?: EvidenceSelector
): Promise<string> {
  if (contentView === 'metadata') {
    return [source.title, source.summary, source.canonical_ref].filter(Boolean).join('\n');
  }

  switch (source.kind) {
    case 'note': {
      const note = await createNoteStore(vaultPath).get(entityRef(source));
      return note ? safeText(note.body, contentView) : '';
    }
    case 'library_item': {
      const item = await createLibraryStore(vaultPath).get(entityRef(source));
      return item ? safeText([item.frontmatter.url, item.body].filter(Boolean).join('\n\n'), contentView) : '';
    }
    case 'resource': {
      const resource = await createResourceStore(vaultPath).get(entityRef(source));
      if (!resource) return '';
      return safeText([
        resource.body,
        ...resource.refs.map((ref) => [ref.title, ref.summary, ref.ref].filter(Boolean).join(' - ')),
        ...resource.timeline.map((entry) => [entry.title, entry.summary].filter(Boolean).join(' - '))
      ].join('\n\n'), contentView);
    }
    case 'project':
      return safeText(await readMetadataFile(source, 'readme_path'), contentView);
    case 'area':
      return [source.title, source.summary].filter(Boolean).join('\n\n');
    case 'conversation': {
      const conversation = await new ConversationStore(vaultPath).get(entityRef(source));
      return conversation
        ? safeText(conversation.turns.map((turn) => `${turn.role}: ${turn.content}`).join('\n\n'), contentView)
        : '';
    }
    case 'task':
      return safeText(await readMetadataFile(source, 'path'), contentView);
    case 'activity_event':
      return contentView === 'full'
        ? JSON.stringify({ summary: source.title, metadata: source.metadata }, null, 2)
        : [source.title, source.summary].filter(Boolean).join('\n');
    case 'kb_doc':
      return safeText(await fs.readFile(path.join(vaultPath, source.canonical_ref), 'utf8').catch(() => ''), contentView);
    case 'external_ai_session':
      if (selector?.kind === 'message_range' && typeof source.metadata?.['path'] === 'string') {
        return safeText(await readExternalAISessionSourceText(source, contentView, selector), contentView);
      }
      if (hasConnectorBacking(source)) {
        return safeText(await readConnectorEvidenceText(vaultPath, source, contentView), contentView);
      }
      return safeText(await readExternalAISessionSourceText(source, contentView, selector), contentView);
    case 'external_file':
      return safeText(await readConnectorEvidenceText(vaultPath, source, contentView), contentView);
  }
}

function makeSource(input: SourceInput): EvidenceSource {
  const scopeRefs = compactScopeRefs(input.scopeRefs ?? []);
  const source: EvidenceSource = {
    id: evidenceSourceId(input.kind, input.ref),
    kind: input.kind,
    ownership: input.kind === 'kb_doc' || input.kind === 'external_file' ? 'reference' : 'orbit_owned',
    title: input.title,
    provider_id: ORBIT_EVIDENCE_PROVIDER_ID,
    canonical_ref: input.canonicalRef,
    updated_at: input.updatedAt,
    observed_at: input.observedAt,
    fingerprint: fingerprintFor(input.fingerprintParts, input.contentSize),
    availability: 'available',
    privacy: input.privacy ?? orbitOwnedPrivacy(),
    ...(input.createdAt ? { created_at: input.createdAt } : {}),
    ...(input.summary ? { summary: input.summary } : {}),
    ...(scopeRefs.length ? { scope_refs: scopeRefs } : {}),
    ...(input.metadata && Object.keys(input.metadata).length ? { metadata: input.metadata } : {}),
    ...(input.timeRange ? { time_range: input.timeRange } : {})
  };
  return source;
}

function sourceMatchesListInput(source: EvidenceSource, input: SourceListInput): boolean {
  if (!input.include_unavailable && source.availability === 'missing') return false;
  if (input.since && source.updated_at < input.since) return false;
  if (input.until && source.updated_at > input.until) return false;
  if (input.scope_refs?.length) {
    const sourceScopes = source.scope_refs ?? [];
    return input.scope_refs.some((wanted) =>
      sourceScopes.some((actual) => actual.kind === wanted.kind && actual.ref === wanted.ref)
    );
  }
  return true;
}

function orbitOwnedPrivacy(): EvidencePrivacy {
  return {
    index_level: 'safe_projection',
    allow_synthesis: true,
    allow_tool_outputs: false,
    redaction_profile: 'default'
  };
}

function privatePrivacy(): EvidencePrivacy {
  return {
    index_level: 'metadata_only',
    allow_synthesis: false,
    allow_tool_outputs: false,
    redaction_profile: 'strict'
  };
}

function referencePrivacy(indexLevel: EvidencePrivacy['index_level']): EvidencePrivacy {
  return {
    index_level: indexLevel,
    allow_synthesis: true,
    allow_tool_outputs: false,
    redaction_profile: 'default'
  };
}

function fingerprintFor(parts: unknown[], sizeBytes?: number): EvidenceFingerprint {
  const value = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return {
    algorithm: 'sha256',
    value,
    ...(sizeBytes !== undefined ? { size_bytes: sizeBytes } : {})
  };
}

function scopeRefsForAreas(areas: string[] | undefined): EvidenceScopeRef[] {
  return (areas ?? []).map((area) => ({ kind: 'area', ref: area }));
}

function scopeRefsForResources(resources: string[] | undefined): EvidenceScopeRef[] {
  return (resources ?? []).map((resource) => ({ kind: 'resource', ref: resource }));
}

function scopeRefsForConversation(scope: ConversationScope | undefined): EvidenceScopeRef[] {
  if (!scope) return [];
  switch (scope.kind) {
    case 'project':
      return [{ kind: 'project', ref: scope.project_id }];
    case 'task':
      return compactScopeRefs([
        { kind: 'task', ref: scope.task_id },
        scope.project_id ? { kind: 'project', ref: scope.project_id } : undefined
      ]);
    case 'area':
      return [{ kind: 'area', ref: scope.area_slug }];
    case 'resource':
      return [{ kind: 'resource', ref: scope.resource_slug }];
    case 'note':
      return [{ kind: 'note', ref: scope.note_id }];
    case 'library':
      return [{ kind: 'library', ref: scope.item_id }];
    case 'global':
    case 'external':
      return [];
  }
}

function compactScopeRefs(values: Array<EvidenceScopeRef | undefined>): EvidenceScopeRef[] {
  const seen = new Set<string>();
  const out: EvidenceScopeRef[] = [];
  for (const value of values) {
    if (!value?.ref) continue;
    const key = `${value.kind}:${value.ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function compactMetadata(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null));
}

function entityRef(source: EvidenceSource): string {
  const ref = source.metadata?.['entity_ref'];
  return typeof ref === 'string' ? ref : source.canonical_ref;
}

async function readMetadataFile(source: EvidenceSource, key: string): Promise<string> {
  const file = source.metadata?.[key];
  return typeof file === 'string' ? fs.readFile(file, 'utf8').catch(() => '') : '';
}

function hasConnectorBacking(source: EvidenceSource): boolean {
  return typeof source.metadata?.['connector_connection_id'] === 'string' && typeof source.metadata?.['doc_ref'] === 'string';
}

function safeText(raw: string, contentView: EvidenceContentView): string {
  if (contentView === 'full') return raw;
  return raw
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/<tool_use>[\s\S]*?<\/tool_use>/gu, ' ')
    .replace(/<tool_result>[\s\S]*?<\/tool_result>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function excerpt(raw: string | undefined, limit = 280): string | undefined {
  const text = safeText(raw ?? '', 'safe_projection');
  return text ? text.slice(0, limit) : undefined;
}

function byteSize(raw: string): number {
  return new TextEncoder().encode(raw).length;
}

function titleFromMarkdown(raw: string, fallback: string): string {
  const heading = raw.match(/^#\s+(.+)$/mu)?.[1]?.trim();
  return heading || path.basename(fallback, path.extname(fallback));
}

function isoDateOrEpoch(value: string | undefined): string {
  if (!value) return new Date(0).toISOString();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? new Date(0).toISOString() : new Date(parsed).toISOString();
}
