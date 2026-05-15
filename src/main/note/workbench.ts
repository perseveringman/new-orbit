import type {
  Note,
  NoteQueueFilter,
  NoteQueueItem,
  NoteRelationKind,
  NoteRelationSuggestion,
  NoteSuggestionAcceptInput,
  NoteSuggestionAcceptResult,
  NoteSuggestionStatus,
  NoteWorkbench,
  NoteWorkbenchBucket,
  NoteWorkbenchPayload,
  NoteWorkbenchSuggestion,
  SpecialMarkerKind
} from '@shared/note';
import type { SynthesisArtifact, SynthesisProvenance, SynthesisSource } from '@shared/synthesis';
import { createApprovalServiceForVault } from '../approval/service';
import { suggestAreaAssignments } from '../area';
import { publishTraceableEvent } from '../events/bus';
import { createResourceStore } from '../resource/store';
import { createSynthesisStore } from '../synthesis/store';
import { createNoteStore } from './store';

interface WorkbenchOptions {
  force?: boolean;
}

const STOPWORDS = new Set([
  'about',
  'after',
  'also',
  'because',
  'before',
  'could',
  'from',
  'have',
  'into',
  'notes',
  'orbit',
  'should',
  'that',
  'this',
  'with',
  '需要',
  '可以',
  '一个',
  '这个',
  '现在',
  '用户'
]);

export async function listNoteQueue(vaultPath: string, filter: NoteQueueFilter = {}): Promise<NoteQueueItem[]> {
  const notes = await createNoteStore(vaultPath).list({
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.para_kind ? { para_kind: filter.para_kind } : {}),
    ...(filter.para_ref ? { para_ref: filter.para_ref } : {}),
    ...(filter.tag ? { tag: filter.tag } : {}),
    ...(filter.area_slug ? { area_slug: filter.area_slug } : {}),
    ...(filter.resource_ref ? { resource_ref: filter.resource_ref } : {}),
    ...(filter.source_kind ? { source_kind: filter.source_kind } : {}),
    ...(filter.include_archived ? { include_archived: true } : {})
  });
  const query = filter.query?.trim().toLowerCase();
  return notes
    .map(noteQueueItem)
    .filter((item) => filter.bucket && filter.bucket !== 'all' ? item.bucket === filter.bucket : true)
    .filter((item) => {
      if (!query) return true;
      return [item.title, item.path, item.tags.join(' '), item.areas.join(' '), item.resource_refs.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
}

export async function buildNoteWorkbench(
  vaultPath: string,
  noteId: string,
  options: WorkbenchOptions = {}
): Promise<NoteWorkbench> {
  const store = createSynthesisStore(vaultPath);
  const note = await resolveNote(vaultPath, noteId);
  const scopeKey = entityScope(note);
  const relationScopeKey = relationScope(note);
  const cached = options.force ? null : await store.latest(scopeKey);
  const cachedRelations = options.force ? null : await store.latest(relationScopeKey);

  if (cached?.status === 'fresh') {
    return workbenchFromArtifacts(note, cached, cachedRelations);
  }

  const payload = await buildWorkbenchPayload(vaultPath, note);
  const relationArtifact = await store.writeFresh({
    kind: 'relate.notes',
    scope_key: relationScopeKey,
    sources: [noteSource(note), rawSource('relations', { relations: payload.relations })],
    provenance: localProvenance('relate.notes.v1'),
    payload: { relations: payload.relations }
  });
  payload.relations = payload.relations.map((relation) => ({ ...relation, artifact_id: relationArtifact.id }));

  const artifact = await store.writeFresh({
    kind: 'summary.entity',
    scope_key: scopeKey,
    sources: [noteSource(note), rawSource('note-workbench', { payload })],
    provenance: localProvenance('summary.entity.v1'),
    payload
  });
  return workbenchFromArtifacts(note, artifact, relationArtifact);
}

export function noteWorkbenchEntityScope(note: Note): string {
  return entityScope(note);
}

export async function acceptNoteSuggestion(
  vaultPath: string,
  input: NoteSuggestionAcceptInput
): Promise<NoteSuggestionAcceptResult> {
  const note = await resolveNote(vaultPath, input.noteId);
  const artifact = await findSuggestionArtifact(vaultPath, note, input);
  const suggestion = findSuggestion(artifact, input.suggestionId);
  if (!suggestion) throw new Error(`note_suggestion_not_found:${input.suggestionId}`);

  const result = await applySuggestion(vaultPath, note, artifact, suggestion);
  await markSuggestionStatus(vaultPath, artifact, suggestion.id, 'accepted');
  publishTraceableEvent({
    source: 'activity',
    type: 'note.suggestion.accepted',
    summary: `Accepted note suggestion: ${suggestionLabel(suggestion)}`,
    payload: {
      note_id: note.frontmatter.id,
      artifact_id: artifact.id,
      suggestion_id: suggestion.id,
      kind: suggestion.kind
    }
  });
  return result;
}

export async function dismissNoteSuggestion(
  vaultPath: string,
  input: NoteSuggestionAcceptInput
): Promise<NoteSuggestionAcceptResult> {
  const note = await resolveNote(vaultPath, input.noteId);
  const artifact = await findSuggestionArtifact(vaultPath, note, input);
  const suggestion = findSuggestion(artifact, input.suggestionId);
  if (!suggestion) throw new Error(`note_suggestion_not_found:${input.suggestionId}`);
  await markSuggestionStatus(vaultPath, artifact, suggestion.id, 'dismissed');
  publishTraceableEvent({
    source: 'activity',
    type: 'note.suggestion.dismissed',
    summary: `Dismissed note suggestion: ${suggestionLabel(suggestion)}`,
    payload: {
      note_id: note.frontmatter.id,
      artifact_id: artifact.id,
      suggestion_id: suggestion.id,
      kind: suggestion.kind
    }
  });
  return { suggestion };
}

async function resolveNote(vaultPath: string, noteIdOrPath: string): Promise<Note> {
  const store = createNoteStore(vaultPath);
  const byId = await store.get(noteIdOrPath);
  if (byId) return byId;
  const byPath = await store.getByPath(noteIdOrPath).catch(() => null);
  if (byPath) return byPath;
  throw new Error(`note_not_found:${noteIdOrPath}`);
}

function noteQueueItem(note: Note): NoteQueueItem {
  const { bucket, reasons } = classifyBucket(note);
  return {
    note_id: note.frontmatter.id,
    title: note.frontmatter.title ?? 'Untitled',
    path: note.path,
    type: note.frontmatter.type,
    updated: note.frontmatter.updated,
    bucket,
    reasons,
    action_count: actionCount(note),
    tags: note.frontmatter.tags,
    areas: note.frontmatter.areas?.map((area) => area.area_slug) ?? [],
    resource_refs: note.frontmatter.resource_refs ?? []
  };
}

function classifyBucket(note: Note): { bucket: NoteWorkbenchBucket; reasons: string[] } {
  if (note.frontmatter.para_kind === 'archive') return { bucket: 'settled', reasons: ['archived'] };
  const reasons: string[] = [];
  if ((note.frontmatter.areas ?? []).length === 0) reasons.push('no Area assignment');
  if ((note.frontmatter.resource_refs ?? []).length === 0) reasons.push('no Resource link');
  if (!note.frontmatter.synthesis_ref) reasons.push('no accepted synthesis');
  if (extractTaskTitle(note.body)) reasons.push('task-like language');
  if (shouldDistill(note)) reasons.push('distillable capture');

  if (reasons.includes('no Area assignment') && reasons.includes('no Resource link')) {
    return { bucket: 'inbox', reasons };
  }
  if (reasons.includes('no Area assignment') || reasons.includes('no Resource link')) {
    return { bucket: 'connect', reasons };
  }
  if (reasons.includes('task-like language') || reasons.includes('distillable capture')) {
    return { bucket: 'express', reasons };
  }
  return { bucket: 'settled', reasons: reasons.length ? reasons : ['linked and processed'] };
}

function actionCount(note: Note): number {
  let count = 0;
  if ((note.frontmatter.areas ?? []).length === 0) count += 1;
  if ((note.frontmatter.resource_refs ?? []).length === 0) count += 1;
  if (extractSuggestedTags(note).length > 0) count += 1;
  if (extractTaskTitle(note.body)) count += 1;
  if (shouldDistill(note)) count += 1;
  return count;
}

async function buildWorkbenchPayload(vaultPath: string, note: Note): Promise<NoteWorkbenchPayload> {
  const [areaSuggestions, resourceSuggestions, relationSuggestions] = await Promise.all([
    suggestAreas(vaultPath, note),
    suggestResources(vaultPath, note),
    suggestRelations(vaultPath, note)
  ]);
  const suggestedTags = extractSuggestedTags(note);
  const suggestions: NoteWorkbenchSuggestion[] = [
    summarizeSuggestion(note),
    ...tagSuggestions(note, suggestedTags),
    ...areaSuggestions,
    ...resourceSuggestions,
    ...expressSuggestions(note)
  ];
  return {
    summary: summarize(note),
    key_points: keyPoints(note),
    suggested_tags: suggestedTags,
    suggestions,
    relations: relationSuggestions
  };
}

function summarizeSuggestion(note: Note): NoteWorkbenchSuggestion {
  return suggestion({
    id: 'summarize-current-note',
    kind: 'summarize',
    title: 'Attach synthesis summary',
    summary: 'Keep this analysis as the accepted synthesis reference for the note.',
    confidence: note.frontmatter.synthesis_ref ? 0.35 : 0.72,
    risk: 'low',
    target: { kind: 'summary', ref: note.frontmatter.id, title: note.frontmatter.title }
  });
}

function tagSuggestions(note: Note, tags: string[]): NoteWorkbenchSuggestion[] {
  if (tags.length === 0) return [];
  return [
    suggestion({
      id: `add-tags-${hashId(tags.join('-'))}`,
      kind: 'add_tags',
      title: `Add tags: ${tags.slice(0, 4).join(', ')}`,
      summary: 'These tags appear in the note body but are not in frontmatter yet.',
      confidence: 0.68,
      risk: 'low',
      target: { kind: 'tag', ref: tags.join(','), title: tags.join(', ') },
      patch: { tags: [...new Set([...note.frontmatter.tags, ...tags])] },
      evidence: tags
    })
  ];
}

async function suggestAreas(vaultPath: string, note: Note): Promise<NoteWorkbenchSuggestion[]> {
  const existing = new Set((note.frontmatter.areas ?? []).map((area) => area.area_slug));
  if (existing.size > 0) return [];
  const suggestions = await suggestAreaAssignments(vaultPath, {
    kind: 'note',
    id: note.frontmatter.id,
    title: note.frontmatter.title
  }).catch(() => []);
  return suggestions.slice(0, 3).map((item) =>
    suggestion({
      id: `classify-area-${item.area_slug}`,
      kind: 'classify_area',
      title: `Assign to Area: ${item.area_slug}`,
      summary: item.reason,
      confidence: item.confidence,
      risk: 'needs_confirm',
      target: { kind: 'area', ref: item.area_slug, title: item.area_slug },
      patch: {
        areas: [
          {
            area_slug: item.area_slug,
            ...(item.primary ? { primary: true } : {}),
            assigned_at: new Date().toISOString(),
            assigned_by: 'synthesis'
          }
        ]
      },
      evidence: [item.reason],
      params: { primary: item.primary === true }
    })
  );
}

async function suggestResources(vaultPath: string, note: Note): Promise<NoteWorkbenchSuggestion[]> {
  const store = createResourceStore(vaultPath);
  const resources = await store.list();
  const noteRefs = new Set(note.frontmatter.resource_refs ?? []);
  const noteWords = keywords(note.body, note.frontmatter.tags);
  const matches = resources
    .map((resource) => {
      const haystack = keywords(
        `${resource.frontmatter.title} ${resource.frontmatter.slug}`,
        resource.frontmatter.tags
      );
      const overlap = [...noteWords].filter((word) => haystack.has(word));
      return { resource, overlap, score: overlap.length + (noteRefs.has(resource.frontmatter.slug) ? -10 : 0) };
    })
    .filter((item) => item.score > 0 && !noteRefs.has(item.resource.frontmatter.slug) && !noteRefs.has(`resources/${item.resource.frontmatter.slug}`))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const linkSuggestions = matches.map((item) =>
    suggestion({
      id: `link-resource-${item.resource.frontmatter.slug}`,
      kind: 'link_resource',
      title: `Link Resource: ${item.resource.frontmatter.title}`,
      summary: `Shared signal: ${item.overlap.slice(0, 4).join(', ')}`,
      confidence: Math.min(0.9, 0.45 + item.score * 0.12),
      risk: 'needs_confirm',
      target: {
        kind: 'resource',
        ref: item.resource.frontmatter.slug,
        title: item.resource.frontmatter.title
      },
      patch: { resource_refs: [...new Set([...(note.frontmatter.resource_refs ?? []), item.resource.frontmatter.slug])] },
      evidence: item.overlap
    })
  );
  if (linkSuggestions.length > 0) return linkSuggestions;

  const seed = bestTopic(note);
  if (!seed) return [];
  return [
    suggestion({
      id: `create-resource-${seed.slug}`,
      kind: 'create_resource_seed',
      title: `Create Resource: ${seed.title}`,
      summary: 'This note has enough topical signal to seed a new Resource workstation.',
      confidence: 0.58,
      risk: 'needs_confirm',
      target: { kind: 'resource', ref: seed.slug, title: seed.title },
      params: { title: seed.title, slug: seed.slug, tags: seed.tags }
    })
  ];
}

async function suggestRelations(vaultPath: string, note: Note): Promise<NoteRelationSuggestion[]> {
  const notes = await createNoteStore(vaultPath).list();
  const anchorWords = keywords(note.body, note.frontmatter.tags);
  const anchorTitle = (note.frontmatter.title ?? '').trim().toLowerCase();
  return notes
    .filter((candidate) => candidate.frontmatter.id !== note.frontmatter.id)
    .map((candidate) => {
      const candidateWords = keywords(candidate.body, candidate.frontmatter.tags);
      const overlap = [...anchorWords].filter((word) => candidateWords.has(word));
      const titleMatch = anchorTitle && anchorTitle === (candidate.frontmatter.title ?? '').trim().toLowerCase();
      const score = overlap.length + (titleMatch ? 4 : 0);
      const kind: NoteRelationKind = titleMatch ? 'duplicates' : overlap.length >= 3 ? 'extends' : 'supports';
      return { candidate, overlap, score, kind };
    })
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => ({
      id: `relate-${item.kind}-${item.candidate.frontmatter.id}`,
      kind: item.kind,
      target_note_id: item.candidate.frontmatter.id,
      target_path: item.candidate.path,
      target_title: item.candidate.frontmatter.title ?? 'Untitled',
      confidence: Math.min(0.92, 0.42 + item.score * 0.1),
      reason: item.kind === 'duplicates' ? 'The titles match closely.' : `Shared concepts: ${item.overlap.slice(0, 5).join(', ')}`,
      evidence: item.overlap.slice(0, 8),
      status: 'proposed',
      created_at: new Date().toISOString()
    }));
}

function expressSuggestions(note: Note): NoteWorkbenchSuggestion[] {
  const out: NoteWorkbenchSuggestion[] = [];
  const taskTitle = extractTaskTitle(note.body);
  if (taskTitle) {
    out.push(
      suggestion({
        id: `propose-task-${hashId(taskTitle)}`,
        kind: 'propose_task',
        title: `Extract task: ${taskTitle}`,
        summary: 'Turn the actionable sentence in this note into a task proposal for Inbox approval.',
        confidence: 0.64,
        risk: 'proposal',
        target: { kind: 'task', ref: taskTitle, title: taskTitle },
        params: { title: taskTitle, description: clip(cleanBody(note.body), 900) },
        evidence: [taskTitle]
      })
    );
  }
  if (shouldDistill(note)) {
    out.push(
      suggestion({
        id: 'distill-longform',
        kind: 'distill_longform',
        title: 'Distill into longform note',
        summary: 'Create a separate longform draft with summary, key points, and provenance back to this note.',
        confidence: 0.7,
        risk: 'needs_confirm',
        target: { kind: 'longform', ref: note.frontmatter.id, title: note.frontmatter.title }
      })
    );
  }
  const marker = detectMarker(note.body);
  if (marker && !note.frontmatter.special_marker) {
    out.push(
      suggestion({
        id: `mark-${marker.kind}`,
        kind: 'mark_special',
        title: `Mark as ${marker.kind}`,
        summary: 'The wording looks like a notable moment worth surfacing in Timeline and Review.',
        confidence: 0.57,
        risk: 'low',
        target: { kind: 'marker', ref: marker.kind, title: marker.kind },
        patch: { special_marker: marker }
      })
    );
  }
  return out;
}

async function applySuggestion(
  vaultPath: string,
  note: Note,
  artifact: SynthesisArtifact,
  suggestion: NoteWorkbenchSuggestion | NoteRelationSuggestion
): Promise<NoteSuggestionAcceptResult> {
  if (isRelationSuggestion(suggestion)) {
    const body = appendRelatedNote(note.body, suggestion);
    const updated = await createNoteStore(vaultPath).update(note.frontmatter.id, {
      body,
      synthesis_ref: artifact.id
    });
    return { suggestion, note: updated };
  }

  const noteStore = createNoteStore(vaultPath);
  if (suggestion.kind === 'summarize') {
    const updated = await noteStore.update(note.frontmatter.id, { synthesis_ref: artifact.id });
    return { suggestion, note: updated };
  }
  if (suggestion.kind === 'add_tags') {
    const tags = suggestion.patch?.tags ?? note.frontmatter.tags;
    const updated = await noteStore.update(note.frontmatter.id, { tags, synthesis_ref: artifact.id });
    return { suggestion, note: updated };
  }
  if (suggestion.kind === 'classify_area') {
    const area = suggestion.patch?.areas?.[0];
    if (!area) throw new Error('classify_area suggestion missing area patch');
    const updated = await noteStore.update(note.frontmatter.id, {
      areas: mergeAreas(note.frontmatter.areas ?? [], [area]),
      synthesis_ref: artifact.id
    });
    return { suggestion, note: updated };
  }
  if (suggestion.kind === 'link_resource') {
    const slug = suggestion.target?.ref;
    if (!slug) throw new Error('link_resource suggestion missing target');
    const updated = await noteStore.update(note.frontmatter.id, {
      resource_refs: [...new Set([...(note.frontmatter.resource_refs ?? []), slug])],
      synthesis_ref: artifact.id
    });
    await createResourceStore(vaultPath).linkRef(slug, {
      kind: 'note',
      ref: note.frontmatter.id,
      title: note.frontmatter.title,
      summary: suggestion.summary,
      section: 'related',
      source: 'suggestion'
    }).catch(() => undefined);
    return { suggestion, note: updated };
  }
  if (suggestion.kind === 'mark_special') {
    const updated = await noteStore.update(note.frontmatter.id, {
      special_marker: suggestion.patch?.special_marker,
      synthesis_ref: artifact.id
    });
    return { suggestion, note: updated };
  }
  if (suggestion.kind === 'distill_longform') {
    const created = await noteStore.create({
      type: 'longform',
      title: `${note.frontmatter.title ?? 'Untitled'} - distilled`,
      body: longformBody(note, artifact.payload as NoteWorkbenchPayload),
      areas: note.frontmatter.areas,
      resource_refs: note.frontmatter.resource_refs,
      source: { kind: 'synthesis', ref: artifact.id, excerpt: note.frontmatter.id },
      synthesis_ref: artifact.id
    });
    const updated = await noteStore.update(note.frontmatter.id, { synthesis_ref: artifact.id });
    return {
      suggestion,
      note: updated,
      created: { kind: 'note', id: created.frontmatter.id, title: created.frontmatter.title, path: created.path }
    };
  }
  if (suggestion.kind === 'create_resource_seed') {
    const title = String(suggestion.params?.['title'] ?? suggestion.target?.title ?? note.frontmatter.title ?? 'Resource');
    const resource = await createResourceStore(vaultPath).create({
      title,
      slug: typeof suggestion.params?.['slug'] === 'string' ? suggestion.params['slug'] : undefined,
      tags: Array.isArray(suggestion.params?.['tags'])
        ? suggestion.params['tags'].filter((tag): tag is string => typeof tag === 'string')
        : note.frontmatter.tags,
      areas: note.frontmatter.areas,
      body: `# ${title}\n\nSeeded from note: ${note.frontmatter.title ?? note.path}\n\n${clip(cleanBody(note.body), 1200)}\n`
    });
    await createResourceStore(vaultPath).linkRef(resource.frontmatter.slug, {
      kind: 'note',
      ref: note.frontmatter.id,
      title: note.frontmatter.title,
      summary: 'Seed note',
      section: 'canonical',
      source: 'suggestion'
    });
    const updated = await noteStore.update(note.frontmatter.id, {
      resource_refs: [...new Set([...(note.frontmatter.resource_refs ?? []), resource.frontmatter.slug])],
      synthesis_ref: artifact.id
    });
    return {
      suggestion,
      note: updated,
      created: {
        kind: 'resource',
        id: resource.frontmatter.slug,
        title: resource.frontmatter.title,
        path: resource.path
      }
    };
  }
  if (suggestion.kind === 'propose_task') {
    const title = String(suggestion.params?.['title'] ?? suggestion.target?.title ?? 'Follow up from note');
    const owner = taskOwner(note);
    if (!owner) throw new Error('propose_task requires the note to have an Area or Resource first');
    const proposal = await createApprovalServiceForVault(vaultPath).submit({
      type: 'new_task',
      submitted_by: 'user',
      subject: `New task from note: ${title}`,
      payload: {
        ...owner,
        title,
        description: String(suggestion.params?.['description'] ?? clip(cleanBody(note.body), 900)),
        frontmatter: {
          source_note_id: note.frontmatter.id,
          source_note_path: note.path,
          synthesis_ref: artifact.id
        }
      }
    });
    const updated = await noteStore.update(note.frontmatter.id, { synthesis_ref: artifact.id });
    return {
      suggestion,
      note: updated,
      created: { kind: 'task_proposal', id: proposal.id, title: proposal.subject }
    };
  }
  return { suggestion };
}

async function findSuggestionArtifact(
  vaultPath: string,
  note: Note,
  input: NoteSuggestionAcceptInput
): Promise<SynthesisArtifact> {
  const store = createSynthesisStore(vaultPath);
  const direct = input.artifactId ? await store.get(input.artifactId) : null;
  if (direct) return direct;
  const summary = await store.latest(entityScope(note));
  if (summary && findSuggestion(summary, input.suggestionId)) return summary;
  const relations = await store.latest(relationScope(note));
  if (relations && findSuggestion(relations, input.suggestionId)) return relations;
  throw new Error(`note_suggestion_artifact_not_found:${input.suggestionId}`);
}

function findSuggestion(
  artifact: SynthesisArtifact,
  suggestionId: string
): NoteWorkbenchSuggestion | NoteRelationSuggestion | null {
  const payload = artifact.payload as Partial<NoteWorkbenchPayload> & { relations?: NoteRelationSuggestion[] };
  return (
    payload.suggestions?.find((item) => item.id === suggestionId) ??
    payload.relations?.find((item) => item.id === suggestionId) ??
    null
  );
}

async function markSuggestionStatus(
  vaultPath: string,
  artifact: SynthesisArtifact,
  suggestionId: string,
  status: NoteSuggestionStatus
): Promise<void> {
  const payload = artifact.payload as Partial<NoteWorkbenchPayload> & { relations?: NoteRelationSuggestion[] };
  const next: Partial<NoteWorkbenchPayload> & { relations?: NoteRelationSuggestion[] } = {
    ...payload,
    suggestions: payload.suggestions?.map((item) => item.id === suggestionId ? { ...item, status } : item),
    relations: payload.relations?.map((item) => item.id === suggestionId ? { ...item, status } : item)
  };
  await createSynthesisStore(vaultPath).applyUserEdit(artifact.id, next);
}

function workbenchFromArtifacts(
  note: Note,
  artifact: SynthesisArtifact,
  relationArtifact: SynthesisArtifact | null
): NoteWorkbench {
  const payload = normalizePayload(artifact.payload);
  const relationPayload = relationArtifact?.payload as { relations?: NoteRelationSuggestion[] } | undefined;
  const relationArtifactId = relationArtifact?.id;
  const relations = (relationPayload?.relations ?? payload.relations).map((relation) => ({
    ...relation,
    artifact_id: relation.artifact_id ?? relationArtifactId
  }));
  const { bucket, reasons } = classifyBucket(note);
  return {
    note,
    bucket,
    bucket_reasons: reasons,
    payload: {
      ...payload,
      suggestions: payload.suggestions.map((item) => ({ ...item, artifact_id: item.artifact_id ?? artifact.id })),
      relations
    },
    artifact_id: artifact.id,
    ...(relationArtifactId ? { relation_artifact_id: relationArtifactId } : {})
  };
}

function normalizePayload(value: unknown): NoteWorkbenchPayload {
  const payload = value as Partial<NoteWorkbenchPayload>;
  return {
    summary: typeof payload?.summary === 'string' ? payload.summary : '',
    key_points: Array.isArray(payload?.key_points) ? payload.key_points.filter((item): item is string => typeof item === 'string') : [],
    suggested_tags: Array.isArray(payload?.suggested_tags) ? payload.suggested_tags.filter((item): item is string => typeof item === 'string') : [],
    suggestions: Array.isArray(payload?.suggestions) ? payload.suggestions : [],
    relations: Array.isArray(payload?.relations) ? payload.relations : []
  };
}

function suggestion(input: Omit<NoteWorkbenchSuggestion, 'status' | 'created_at'> & { status?: NoteSuggestionStatus }): NoteWorkbenchSuggestion {
  return {
    ...input,
    status: input.status ?? 'proposed',
    created_at: new Date().toISOString()
  };
}

function isRelationSuggestion(value: NoteWorkbenchSuggestion | NoteRelationSuggestion): value is NoteRelationSuggestion {
  return 'target_note_id' in value;
}

function suggestionLabel(value: NoteWorkbenchSuggestion | NoteRelationSuggestion): string {
  return isRelationSuggestion(value) ? value.target_title : value.title;
}

function noteSource(note: Note): SynthesisSource {
  return {
    kind: 'note',
    ref: note.frontmatter.id,
    title: note.frontmatter.title ?? note.path,
    excerpt: clip(cleanBody(note.body), 1600),
    metadata: {
      path: note.path,
      tags: note.frontmatter.tags,
      areas: note.frontmatter.areas,
      resource_refs: note.frontmatter.resource_refs,
      source: note.frontmatter.source
    }
  };
}

function rawSource(title: string, metadata: Record<string, unknown>): SynthesisSource {
  return { kind: 'raw', title, metadata };
}

function localProvenance(promptVersion: string): SynthesisProvenance {
  return {
    runtime: 'local:heuristic',
    model: 'note-workbench-heuristic',
    prompt_version: promptVersion,
    generated_at: new Date().toISOString(),
    cost_usd: 0,
    tokens: { input: 0, output: 0 }
  };
}

function entityScope(note: Note): string {
  return `entity:note:${note.frontmatter.id}`;
}

function relationScope(note: Note): string {
  return `relate:note:${note.frontmatter.id}`;
}

function summarize(note: Note): string {
  return clip(firstParagraph(cleanBody(note.body)) || note.frontmatter.title || 'Untitled note', 520);
}

function keyPoints(note: Note): string[] {
  const body = cleanBody(note.body);
  const bullets = body
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter((line) => line.length >= 18)
    .slice(0, 4);
  if (bullets.length > 0) return bullets;
  return body
    .split(/[。.!?]\s*/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 18)
    .slice(0, 4);
}

function cleanBody(body: string): string {
  return body
    .replace(/^---[\s\S]*?---\s*/u, '')
    .replace(/^#\s+.+$/mu, '')
    .trim();
}

function firstParagraph(body: string): string {
  return body.split(/\n\s*\n/).map((part) => part.trim()).find(Boolean) ?? '';
}

function extractSuggestedTags(note: Note): string[] {
  const existing = new Set(note.frontmatter.tags.map((tag) => tag.toLowerCase()));
  const hashTags = [...note.body.matchAll(/#([A-Za-z0-9_\-\u4e00-\u9fff]{2,32})/g)].map((match) => match[1]);
  const frequent = [...keywords(note.body, [])].slice(0, 6);
  return [...new Set([...hashTags, ...frequent])]
    .map((tag) => tag.toLowerCase())
    .filter((tag) => !existing.has(tag))
    .slice(0, 6);
}

function keywords(text: string, tags: string[]): Set<string> {
  const words = text
    .toLowerCase()
    .match(/[a-z0-9_-]{3,}|[\u4e00-\u9fff]{2,}/g) ?? [];
  return new Set(
    [...tags, ...words]
      .map((word) => word.toLowerCase().replace(/^#/, ''))
      .filter((word) => word.length >= 2 && !STOPWORDS.has(word))
      .slice(0, 80)
  );
}

function shouldDistill(note: Note): boolean {
  const words = note.frontmatter.word_count ?? cleanBody(note.body).length / 4;
  return (note.frontmatter.type === 'capture' || note.frontmatter.type === 'thought') && words >= 120;
}

function extractTaskTitle(body: string): string | null {
  const lines = cleanBody(body).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const match = lines.find((line) =>
    /^(todo|fix|implement|follow up|next|需要|待办|下一步|修复|实现)[:：\-\s]/i.test(line)
  );
  return match ? match.replace(/^(todo|fix|implement|follow up|next|需要|待办|下一步|修复|实现)[:：\-\s]*/i, '').slice(0, 100) : null;
}

function detectMarker(body: string): { kind: SpecialMarkerKind; icon: string } | null {
  const lower = body.toLowerCase();
  if (/breakthrough|突破|想通了/.test(lower)) return { kind: 'breakthrough', icon: '✦' };
  if (/insight|洞察|发现/.test(lower)) return { kind: 'insight', icon: '!' };
  if (/setback|阻塞|失败|卡住/.test(lower)) return { kind: 'setback', icon: '-' };
  if (/milestone|里程碑|完成/.test(lower)) return { kind: 'milestone', icon: '*' };
  if (/reflection|复盘|反思/.test(lower)) return { kind: 'reflection', icon: '~' };
  return null;
}

function bestTopic(note: Note): { title: string; slug: string; tags: string[] } | null {
  const tags = extractSuggestedTags(note).slice(0, 3);
  const title = tags[0] ?? note.frontmatter.tags[0] ?? note.frontmatter.title;
  if (!title || String(title).length < 2) return null;
  return {
    title: titleFromTopic(String(title)),
    slug: slugify(String(title)),
    tags
  };
}

function titleFromTopic(topic: string): string {
  return topic
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'resource';
}

function hashId(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

function clip(value: string, limit: number): string {
  const trimmed = value.trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}...` : trimmed;
}

function mergeAreas(current: NonNullable<Note['frontmatter']['areas']>, next: NonNullable<Note['frontmatter']['areas']>): NonNullable<Note['frontmatter']['areas']> {
  const bySlug = new Map(current.map((area) => [area.area_slug, area]));
  for (const area of next) bySlug.set(area.area_slug, area);
  return [...bySlug.values()];
}

function appendRelatedNote(body: string, relation: NoteRelationSuggestion): string {
  const existing = body.includes(`[[${relation.target_title}]]`) || body.includes(`[[${relation.target_path}]]`);
  if (existing) return body;
  return `${body.trim()}\n\n## Related\n\n- [[${relation.target_title}]] - ${relation.kind}: ${relation.reason}\n`;
}

function longformBody(note: Note, payload: NoteWorkbenchPayload): string {
  const title = `${note.frontmatter.title ?? 'Untitled'} - distilled`;
  return [
    `# ${title}`,
    '',
    '## Summary',
    '',
    payload.summary,
    '',
    '## Key points',
    '',
    ...(payload.key_points.length ? payload.key_points.map((point) => `- ${point}`) : ['- No key points extracted yet.']),
    '',
    '## Source',
    '',
    `- Note: ${note.frontmatter.id}`,
    `- Path: ${note.path}`
  ].join('\n');
}

function taskOwner(note: Note): { area_uid: string } | { resource_uid: string } | null {
  const resource = note.frontmatter.resource_refs?.[0];
  if (resource) return { resource_uid: resource.replace(/^resources\//, '') };
  const area = note.frontmatter.areas?.[0]?.area_slug;
  if (area) return { area_uid: area };
  return null;
}
