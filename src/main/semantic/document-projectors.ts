import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AreaConfig } from '@shared/area';
import type { Conversation } from '@shared/conversation';
import { evidenceSourceId, wholeSourceSelector, type EvidenceSourceKind } from '@shared/evidence';
import type { LibraryItem } from '@shared/library';
import type { Note } from '@shared/note';
import type { Resource } from '@shared/resource';
import type { SemanticDocument } from '@shared/semantic';
import type { PersonalQAPayload, SynthesisArtifact } from '@shared/synthesis';
import { KnowledgeBaseStore } from '../knowledge-base/store';
import { createConnectorStore } from '../connectors/store';
import { createLibraryStore } from '../library/store';
import { createNoteStore } from '../note/store';
import { listProjects, type ProjectSummary } from '../project';
import { createResourceStore } from '../resource/store';
import { createSynthesisStore } from '../synthesis/store';
import { toPosix } from '../pathGuard';
import { listAreas } from '../area';
import { ConversationStore } from '../conversation/store';

export async function collectSemanticDocuments(vaultPath: string): Promise<SemanticDocument[]> {
  const [notes, libraryItems, resources, projects, areas, conversations, artifacts, kbDocs, connectorDocs] = await Promise.all([
    createNoteStore(vaultPath).list({ include_archived: true }),
    createLibraryStore(vaultPath).list({ include_archived: true }),
    createResourceStore(vaultPath).list({ include_archived: true }).then((items) =>
      Promise.all(items.map((summary) => createResourceStore(vaultPath).get(summary.frontmatter.slug)))
    ),
    listProjects(vaultPath),
    listAreas(vaultPath),
    new ConversationStore(vaultPath).list().then(async (items) => {
      const store = new ConversationStore(vaultPath);
      const full = await Promise.all(items.filter((item) => !item.archived).map((item) => store.get(item.id)));
      return full.filter((item): item is Conversation => Boolean(item));
    }),
    createSynthesisStore(vaultPath).list({ limit: 500 }),
    projectKnowledgeBaseDocs(vaultPath),
    projectConnectorDocuments(vaultPath)
  ]);
  const projectDocs = await Promise.all(projects.map((project) => projectProject(vaultPath, project)));

  return [
    ...notes.map(projectNote),
    ...libraryItems.map(projectLibraryItem),
    ...resources.filter((item): item is Resource => Boolean(item)).map(projectResource),
    ...projectDocs,
    ...areas.map(projectArea),
    ...conversations.map(projectConversation),
    ...artifacts.map(projectSynthesisArtifact),
    ...kbDocs,
    ...connectorDocs
  ].filter((doc) => doc.content.trim().length > 0 || doc.title.trim().length > 0);
}

export function projectNote(note: Note): SemanticDocument {
  return {
    id: `note:${note.frontmatter.id}`,
    entity_kind: 'note',
    entity_ref: note.frontmatter.id,
    ...evidenceProjection('note', note.frontmatter.id),
    title: note.frontmatter.title ?? note.path,
    content: cleanMarkdown(note.body),
    tags: note.frontmatter.tags,
    areas: note.frontmatter.areas?.map((area) => area.area_slug),
    resource_refs: note.frontmatter.resource_refs,
    layer: 1,
    layer_label: 'truth',
    updated_at: note.frontmatter.updated
  };
}

export function projectLibraryItem(item: LibraryItem): SemanticDocument {
  return {
    id: `library_item:${item.frontmatter.id}`,
    entity_kind: 'library_item',
    entity_ref: item.frontmatter.id,
    ...evidenceProjection('library_item', item.frontmatter.id),
    title: item.frontmatter.title,
    content: cleanMarkdown([item.frontmatter.url, item.body, annotationsText(item)].filter(Boolean).join('\n\n')),
    tags: item.frontmatter.tags,
    areas: item.frontmatter.areas?.map((area) => area.area_slug),
    resource_refs: item.frontmatter.resource_refs,
    layer: 1,
    layer_label: 'truth',
    updated_at: item.frontmatter.updated
  };
}

export function projectResource(resource: Resource): SemanticDocument {
  return {
    id: `resource:${resource.frontmatter.slug}`,
    entity_kind: 'resource',
    entity_ref: resource.frontmatter.slug,
    ...evidenceProjection('resource', resource.frontmatter.slug),
    title: resource.frontmatter.title,
    content: cleanMarkdown([
      resource.body,
      ...resource.refs.map((ref) => [ref.title, ref.summary, ref.ref].filter(Boolean).join(' - ')),
      ...resource.timeline.map((entry) => [entry.title, entry.summary].filter(Boolean).join(' - '))
    ].join('\n\n')),
    tags: resource.frontmatter.tags,
    areas: resource.frontmatter.areas?.map((area) => area.area_slug),
    layer: 1,
    layer_label: 'truth',
    updated_at: resource.frontmatter.updated
  };
}

export async function projectProject(vaultPath: string, project: ProjectSummary): Promise<SemanticDocument> {
  const content = await fs.readFile(project.readmePath, 'utf8').catch(() => project.name);
  const ref = project.uid || project.slug;
  return {
    id: `project:${ref}`,
    entity_kind: 'project',
    entity_ref: ref,
    ...evidenceProjection('project', ref),
    title: project.name,
    content: cleanMarkdown(content),
    tags: project.tags,
    areas: project.area_slugs,
    layer: 1,
    layer_label: 'truth',
    updated_at: project.archived_at ?? project.created_at ?? new Date(0).toISOString()
  };
}

export function projectArea(area: AreaConfig): SemanticDocument {
  return {
    id: `area:${area.slug}`,
    entity_kind: 'area',
    entity_ref: area.slug,
    ...evidenceProjection('area', area.slug),
    title: area.name,
    content: cleanMarkdown([area.name, area.description, area.tags.join(' '), area.vision_refs?.join(' ')].filter(Boolean).join('\n\n')),
    tags: area.tags,
    areas: [area.slug],
    layer: 1,
    layer_label: 'truth',
    updated_at: area.updated_at
  };
}

export function projectConversation(conversation: Conversation): SemanticDocument {
  const scope = conversation.scope ? JSON.stringify(conversation.scope) : 'global';
  return {
    id: `conversation:${conversation.id}`,
    entity_kind: 'conversation',
    entity_ref: conversation.id,
    ...evidenceProjection('conversation', conversation.id),
    title: conversation.title ?? `Conversation ${conversation.id}`,
    content: cleanMarkdown([conversation.summary, scope, ...conversation.turns.map((turn) => `${turn.role}: ${turn.content}`)].filter(Boolean).join('\n\n')),
    tags: conversation.tags,
    areas: conversation.scope?.kind === 'area' ? [conversation.scope.area_slug] : undefined,
    resource_refs: conversation.scope?.kind === 'resource' ? [conversation.scope.resource_slug] : undefined,
    layer: 1,
    layer_label: 'truth',
    updated_at: conversation.updatedAt
  };
}

export function projectSynthesisArtifact(artifact: SynthesisArtifact): SemanticDocument {
  return {
    id: `synthesis_artifact:${artifact.id}`,
    entity_kind: 'synthesis_artifact',
    entity_ref: artifact.id,
    title: synthesisArtifactTitle(artifact),
    content: synthesisArtifactContent(artifact),
    layer: 2,
    layer_label: 'synthesis',
    updated_at: artifact.created_at
  };
}

function synthesisArtifactTitle(artifact: SynthesisArtifact): string {
  if (artifact.kind === 'qa.personal' && isPersonalQAPayloadLike(artifact.payload)) {
    return artifact.payload.question;
  }
  return `${artifact.kind} ${artifact.scope_key}`;
}

function synthesisArtifactContent(artifact: SynthesisArtifact): string {
  if (artifact.kind === 'qa.personal' && isPersonalQAPayloadLike(artifact.payload)) {
    return cleanMarkdown([
      artifact.payload.question,
      artifact.payload.answer,
      artifact.payload.entities.join(' '),
      artifact.payload.evidence.map((selector) => selector.source_id).join(' ')
    ].filter(Boolean).join('\n\n'));
  }
  return cleanMarkdown(JSON.stringify({ kind: artifact.kind, scope: artifact.scope_key, payload: artifact.payload }));
}

export async function projectKnowledgeBaseDocs(vaultPath: string): Promise<SemanticDocument[]> {
  const docs: SemanticDocument[] = [];
  for (const kb of await new KnowledgeBaseStore(vaultPath).list().catch(() => [])) {
    const root = path.join(vaultPath, kb.path);
    for (const file of await walkMarkdown(root)) {
      const raw = await fs.readFile(file, 'utf8').catch(() => '');
      const rel = toPosix(path.relative(vaultPath, file));
      docs.push({
        id: `kb_doc:${kb.id}:${rel}`,
        entity_kind: 'kb_doc',
        entity_ref: `${kb.id}/${rel.slice(kb.path.length + 1)}`,
        ...evidenceProjection('kb_doc', `${kb.id}/${rel.slice(kb.path.length + 1)}`),
        title: titleFromMarkdown(raw, rel),
        content: cleanMarkdown(raw),
        tags: [],
        layer: 1,
        layer_label: 'truth',
        updated_at: kb.last_scanned_at ?? kb.imported_at
      });
    }
  }
  return docs;
}

export async function projectConnectorDocuments(vaultPath: string): Promise<SemanticDocument[]> {
  const store = createConnectorStore(vaultPath);
  const docs: SemanticDocument[] = [];
  for (const doc of await store.listDocuments().catch(() => [])) {
    const content = await store.read({ connection_id: doc.connection_id, doc_ref: doc.doc_ref, content_view: 'safe_projection' });
    const ref = `connector:${doc.connection_id}:${doc.doc_ref}`;
    docs.push({
      id: `external_file:${doc.connection_id}:${doc.doc_ref}`,
      entity_kind: 'external_file',
      entity_ref: ref,
      ...evidenceProjection('external_file', ref),
      title: doc.title,
      content: cleanMarkdown(content?.content_markdown ?? doc.excerpt ?? ''),
      tags: [],
      layer: 1,
      layer_label: 'reference',
      updated_at: doc.updated_at
    });
  }
  return docs;
}

function evidenceProjection(kind: EvidenceSourceKind, ref: string): Pick<SemanticDocument, 'source_id' | 'evidence_selectors'> {
  const sourceId = evidenceSourceId(kind, ref);
  return {
    source_id: sourceId,
    evidence_selectors: [wholeSourceSelector(sourceId, 'safe_projection', 'semantic projection')]
  };
}

function isPersonalQAPayloadLike(payload: unknown): payload is PersonalQAPayload {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      typeof (payload as PersonalQAPayload).question === 'string' &&
      typeof (payload as PersonalQAPayload).answer === 'string' &&
      Array.isArray((payload as PersonalQAPayload).entities) &&
      Array.isArray((payload as PersonalQAPayload).evidence)
  );
}

function annotationsText(item: LibraryItem): string {
  return item.frontmatter.annotations?.map((annotation) => [annotation.text, annotation.comment].filter(Boolean).join(' - ')).join('\n') ?? '';
}

export function cleanMarkdown(raw: string): string {
  return raw
    .replace(/^---[\s\S]*?---\s*/u, '')
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/[#>*_`~-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function titleFromMarkdown(raw: string, fallback: string): string {
  const heading = raw.match(/^#\s+(.+)$/mu)?.[1]?.trim();
  return heading || path.basename(fallback, path.extname(fallback));
}

async function walkMarkdown(root: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const abs = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...(await walkMarkdown(abs)));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) out.push(abs);
  }
  return out;
}
