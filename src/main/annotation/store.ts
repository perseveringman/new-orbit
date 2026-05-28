import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ORBIT_DIR } from '@shared/constants';
import type {
  AnnotationFilter,
  AnnotationRecord,
  AnnotationTargetRef,
  AnnotationViewState,
  CreateAnnotationInput,
  UpdateAnnotationInput,
  UpdateAnnotationViewStateInput
} from '@shared/annotation';

interface AnnotationIndexFile {
  version: 1;
  ids: string[];
  target_index: Record<string, string[]>;
  updated_at?: string;
}

interface AnnotationViewStateFile {
  version: 1;
  states: Record<string, AnnotationViewState>;
  updated_at?: string;
}

export function annotationsRoot(vaultPath: string): string {
  return path.join(vaultPath, ORBIT_DIR, 'annotations');
}

export function annotationRecordsDir(vaultPath: string): string {
  return path.join(annotationsRoot(vaultPath), 'records');
}

export function annotationIndexPath(vaultPath: string): string {
  return path.join(annotationsRoot(vaultPath), 'index.json');
}

export function annotationViewStatesDir(vaultPath: string): string {
  return path.join(annotationsRoot(vaultPath), 'views');
}

export class AnnotationStore {
  constructor(private readonly vaultPath: string) {}

  async create(input: CreateAnnotationInput): Promise<AnnotationRecord> {
    const now = new Date().toISOString();
    const record: AnnotationRecord = {
      id: `ann-${randomUUID()}`,
      target: input.target,
      ...(input.context_target ? { context_target: input.context_target } : {}),
      anchor: input.anchor,
      type: input.type,
      ...(input.color ? { color: input.color } : {}),
      title: input.title?.trim() || defaultAnnotationTitle(input),
      body_markdown: input.body_markdown,
      ...(input.parent_annotation_id ? { parent_annotation_id: input.parent_annotation_id } : {}),
      created_at: now,
      updated_at: now,
      created_by: input.created_by ?? 'user',
      ...(input.linked_note_id ? { linked_note_id: input.linked_note_id } : {}),
      ...(input.artifact_refs ? { artifact_refs: uniqueStrings(input.artifact_refs) } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {})
    };
    await this.writeRecord(record);
    await this.rebuildIndex();
    return record;
  }

  async get(id: string): Promise<AnnotationRecord | null> {
    try {
      const raw = await fs.readFile(annotationRecordPath(this.vaultPath, id), 'utf8');
      return normalizeAnnotationRecord(JSON.parse(raw));
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async list(filter: AnnotationFilter = {}): Promise<AnnotationRecord[]> {
    const index = await this.readOrRebuildIndex();
    const records = (await Promise.all(index.ids.map((id) => this.get(id)))).filter(
      (record): record is AnnotationRecord => Boolean(record)
    );
    return records
      .filter((record) => matchesFilter(record, filter))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async listForTarget(target: AnnotationTargetRef, includeArchived = false): Promise<AnnotationRecord[]> {
    return this.list({ target, include_archived: includeArchived });
  }

  async update(id: string, patch: UpdateAnnotationInput): Promise<AnnotationRecord> {
    const current = await this.get(id);
    if (!current) throw new Error(`annotation_not_found:${id}`);
    const next: AnnotationRecord = {
      ...current,
      ...(patch.target ? { target: patch.target } : {}),
      ...(patch.context_target === null
        ? { context_target: undefined }
        : patch.context_target
          ? { context_target: patch.context_target }
          : {}),
      ...(patch.anchor ? { anchor: patch.anchor } : {}),
      ...(patch.type ? { type: patch.type } : {}),
      ...(patch.color === null ? { color: undefined } : patch.color ? { color: patch.color } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body_markdown !== undefined ? { body_markdown: patch.body_markdown } : {}),
      ...(patch.parent_annotation_id === null
        ? { parent_annotation_id: undefined }
        : patch.parent_annotation_id
          ? { parent_annotation_id: patch.parent_annotation_id }
          : {}),
      ...(patch.linked_note_id === null
        ? { linked_note_id: undefined }
        : patch.linked_note_id
          ? { linked_note_id: patch.linked_note_id }
          : {}),
      ...(patch.artifact_refs ? { artifact_refs: uniqueStrings(patch.artifact_refs) } : {}),
      ...(patch.metadata === null ? { metadata: undefined } : patch.metadata ? { metadata: patch.metadata } : {}),
      ...(patch.archived !== undefined ? { archived: patch.archived } : {}),
      updated_at: new Date().toISOString()
    };
    await this.writeRecord(stripUndefined(next));
    await this.rebuildIndex();
    return stripUndefined(next);
  }

  async archive(id: string): Promise<AnnotationRecord> {
    return this.update(id, { archived: true });
  }

  async listViewStates(spaceId: string): Promise<AnnotationViewState[]> {
    const file = await this.readViewStateFile(spaceId);
    return Object.values(file.states);
  }

  async updateViewState(
    spaceId: string,
    annotationId: string,
    patch: UpdateAnnotationViewStateInput
  ): Promise<AnnotationViewState> {
    const file = await this.readViewStateFile(spaceId);
    const now = new Date().toISOString();
    const current = file.states[annotationId];
    const next: AnnotationViewState = {
      space_id: spaceId,
      annotation_id: annotationId,
      position: patch.position ?? current?.position ?? { x: 80, y: 80 },
      size: patch.size ?? current?.size ?? { width: 390, height: 310 },
      z_index: patch.z_index ?? current?.z_index ?? 1,
      status: patch.status ?? current?.status ?? 'open',
      updated_at: now
    };
    file.states[annotationId] = next;
    file.updated_at = now;
    await this.writeViewStateFile(spaceId, file);
    return next;
  }

  private async writeRecord(record: AnnotationRecord): Promise<void> {
    const dir = annotationRecordsDir(this.vaultPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(annotationRecordPath(this.vaultPath, record.id), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  }

  private async readOrRebuildIndex(): Promise<AnnotationIndexFile> {
    try {
      const raw = await fs.readFile(annotationIndexPath(this.vaultPath), 'utf8');
      return normalizeAnnotationIndex(JSON.parse(raw));
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      return this.rebuildIndex();
    }
  }

  private async rebuildIndex(): Promise<AnnotationIndexFile> {
    const dir = annotationRecordsDir(this.vaultPath);
    await fs.mkdir(dir, { recursive: true });
    const entries = await fs.readdir(dir).catch(() => []);
    const records = (
      await Promise.all(
        entries
          .filter((entry) => entry.endsWith('.json'))
          .map((entry) => this.get(path.basename(entry, '.json')))
      )
    ).filter((record): record is AnnotationRecord => Boolean(record));
    const targetIndex: Record<string, string[]> = {};
    records.forEach((record) => {
      appendIndex(targetIndex, targetKey(record.target), record.id);
      if (record.context_target) appendIndex(targetIndex, targetKey(record.context_target), record.id);
      if (record.parent_annotation_id) {
        appendIndex(targetIndex, targetKey({ kind: 'annotation', ref: record.parent_annotation_id }), record.id);
      }
    });
    const index: AnnotationIndexFile = {
      version: 1,
      ids: records.map((record) => record.id).sort(),
      target_index: targetIndex,
      updated_at: new Date().toISOString()
    };
    await fs.mkdir(annotationsRoot(this.vaultPath), { recursive: true });
    await fs.writeFile(annotationIndexPath(this.vaultPath), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    return index;
  }

  private async readViewStateFile(spaceId: string): Promise<AnnotationViewStateFile> {
    try {
      const raw = await fs.readFile(annotationViewStatePath(this.vaultPath, spaceId), 'utf8');
      return normalizeViewStateFile(JSON.parse(raw));
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      return { version: 1, states: {} };
    }
  }

  private async writeViewStateFile(spaceId: string, file: AnnotationViewStateFile): Promise<void> {
    const dir = annotationViewStatesDir(this.vaultPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(annotationViewStatePath(this.vaultPath, spaceId), `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  }
}

export function createAnnotationStore(vaultPath: string): AnnotationStore {
  return new AnnotationStore(vaultPath);
}

function annotationRecordPath(vaultPath: string, id: string): string {
  return path.join(annotationRecordsDir(vaultPath), `${safeFileName(id)}.json`);
}

function annotationViewStatePath(vaultPath: string, spaceId: string): string {
  return path.join(annotationViewStatesDir(vaultPath), `${safeFileName(spaceId)}.json`);
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.:-]+/g, '_').slice(0, 160) || 'default';
}

function targetKey(target: AnnotationTargetRef): string {
  return `${target.kind}:${target.ref}`;
}

function appendIndex(index: Record<string, string[]>, key: string, id: string): void {
  index[key] = [...new Set([...(index[key] ?? []), id])];
}

function matchesFilter(record: AnnotationRecord, filter: AnnotationFilter): boolean {
  if (!filter.include_archived && record.archived) return false;
  if (filter.type && record.type !== filter.type) return false;
  if (filter.parent_annotation_id !== undefined && record.parent_annotation_id !== filter.parent_annotation_id) return false;
  if (filter.target && targetKey(record.target) !== targetKey(filter.target) && targetKey(record.context_target ?? record.target) !== targetKey(filter.target)) {
    return false;
  }
  if (filter.context_target && targetKey(record.context_target ?? record.target) !== targetKey(filter.context_target)) {
    return false;
  }
  return true;
}

function defaultAnnotationTitle(input: CreateAnnotationInput): string {
  if (input.type === 'resource_note') return '资料标注';
  if (input.type === 'ai_note') return 'AI 标注';
  if (input.type === 'highlight') return '标注';
  return input.type;
}

function normalizeAnnotationRecord(value: unknown): AnnotationRecord {
  const record = value as AnnotationRecord;
  return stripUndefined({
    ...record,
    artifact_refs: uniqueStrings(record.artifact_refs ?? []),
    archived: Boolean(record.archived)
  });
}

function normalizeAnnotationIndex(value: unknown): AnnotationIndexFile {
  const index = value as Partial<AnnotationIndexFile>;
  return {
    version: 1,
    ids: uniqueStrings(index.ids ?? []),
    target_index: index.target_index && typeof index.target_index === 'object' ? index.target_index : {},
    ...(index.updated_at ? { updated_at: index.updated_at } : {})
  };
}

function normalizeViewStateFile(value: unknown): AnnotationViewStateFile {
  const file = value as Partial<AnnotationViewStateFile>;
  return {
    version: 1,
    states: file.states && typeof file.states === 'object' ? file.states : {},
    ...(file.updated_at ? { updated_at: file.updated_at } : {})
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'ENOENT');
}
