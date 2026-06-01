import { promises as fs } from 'node:fs';
import path from 'node:path';
import { shell } from 'electron';
import type {
  EvidenceNavigationTarget,
  EvidenceOpenResult,
  EvidenceSelector,
  EvidenceSource
} from '@shared/evidence';
import { createConnectorStore } from '../connectors/store';
import { createOrbitEvidenceProvider } from './providers';
import { createEvidenceStore } from './store';

export async function resolveEvidenceNavigation(
  vaultPath: string,
  selector: EvidenceSelector
): Promise<EvidenceNavigationTarget> {
  const source = await sourceForSelector(vaultPath, selector);
  if (!source) {
    return unavailableTarget(selector, '找不到这条引用对应的来源。');
  }

  const connectorTarget = connectorNavigationTarget(source, selector);
  if (connectorTarget) return connectorTarget;

  const workspaceTarget = workspaceNavigationTarget(source, selector);
  if (workspaceTarget) return workspaceTarget;

  const urlTarget = urlNavigationTarget(source, selector);
  if (urlTarget) return urlTarget;

  const fileTarget = await fileNavigationTarget(vaultPath, source, selector);
  if (fileTarget) return fileTarget;

  return unavailableTarget(selector, '这条引用没有可打开的原始位置。', source);
}

export async function openEvidenceNavigation(
  vaultPath: string,
  selector: EvidenceSelector
): Promise<EvidenceOpenResult> {
  const target = await resolveEvidenceNavigation(vaultPath, selector);
  if (!target.available) return { target, opened: false, message: target.reason };

  if (target.kind === 'connector_doc' && target.connection_id && target.doc_ref) {
    await createConnectorStore(vaultPath).open(target.connection_id, target.doc_ref);
    return { target, opened: true };
  }

  if (target.kind === 'external_url' && target.url) {
    await shell.openExternal(target.url);
    return { target, opened: true };
  }

  if ((target.kind === 'external_file' || target.kind === 'vault_file') && target.path) {
    const message = await shell.openPath(target.path);
    return { target, opened: !message, ...(message ? { message } : {}) };
  }

  return {
    target,
    opened: false,
    message: target.kind === 'workspace_view'
      ? 'workspace_navigation_requires_renderer'
      : 'navigation_target_not_openable'
  };
}

async function sourceForSelector(
  vaultPath: string,
  selector: EvidenceSelector
): Promise<EvidenceSource | null> {
  return (await createEvidenceStore(vaultPath).get(selector.source_id))
    ?? createOrbitEvidenceProvider(vaultPath).get(selector.source_id);
}

function connectorNavigationTarget(
  source: EvidenceSource,
  selector: EvidenceSelector
): EvidenceNavigationTarget | null {
  const connectionId = metadataString(source, 'connector_connection_id');
  const docRef = metadataString(source, 'doc_ref');
  if (!connectionId || !docRef) return null;
  return {
    ...targetBase(source, selector),
    kind: 'connector_doc',
    available: true,
    connection_id: connectionId,
    doc_ref: docRef,
    reason: metadataString(source, 'connector_name') ?? '连接器原始文档'
  };
}

function workspaceNavigationTarget(
  source: EvidenceSource,
  selector: EvidenceSelector
): EvidenceNavigationTarget | null {
  const ref = metadataString(source, 'entity_ref') ?? source.canonical_ref;
  switch (source.kind) {
    case 'conversation':
      return {
        ...targetBase(source, selector),
        kind: 'workspace_view',
        available: true,
        view: { kind: 'askAnywhere', activeId: ref },
        reason: '打开随处问会话'
      };
    case 'project':
      return {
        ...targetBase(source, selector),
        kind: 'workspace_view',
        available: true,
        view: { kind: 'project', projectUid: ref },
        reason: '打开项目工作台'
      };
    case 'area': {
      const uid = metadataString(source, 'uid') ?? ref;
      return {
        ...targetBase(source, selector),
        kind: 'workspace_view',
        available: true,
        view: { kind: 'areaRoom', areaUid: uid },
        reason: '打开领域工作台'
      };
    }
    case 'resource': {
      const slug = metadataString(source, 'slug') ?? ref;
      return {
        ...targetBase(source, selector),
        kind: 'workspace_view',
        available: true,
        view: { kind: 'resource', resourceSlug: slug },
        reason: '打开资源页'
      };
    }
    case 'activity_event':
      return {
        ...targetBase(source, selector),
        kind: 'workspace_view',
        available: true,
        view: { kind: 'timeline' },
        reason: '打开时间线'
      };
    default:
      return null;
  }
}

function urlNavigationTarget(
  source: EvidenceSource,
  selector: EvidenceSelector
): EvidenceNavigationTarget | null {
  const url = firstUrl(metadataString(source, 'url'), source.canonical_ref);
  if (!url) return null;
  if (source.kind !== 'external_file' && source.kind !== 'library_item') return null;
  return {
    ...targetBase(source, selector),
    kind: 'external_url',
    available: true,
    url,
    reason: '打开原始链接'
  };
}

async function fileNavigationTarget(
  vaultPath: string,
  source: EvidenceSource,
  selector: EvidenceSelector
): Promise<EvidenceNavigationTarget | null> {
  const candidate = await firstExistingPath(vaultPath, source, pathCandidateKeys(source));
  if (!candidate) return null;
  const insideVault = isInside(vaultPath, candidate.absolute);
  return {
    ...targetBase(source, selector),
    kind: insideVault ? 'vault_file' : 'external_file',
    available: true,
    path: candidate.absolute,
    ...(insideVault ? { rel_path: toPosix(path.relative(vaultPath, candidate.absolute)) } : {}),
    reason: insideVault ? '打开 Orbit 内部来源' : '打开外部原始文件'
  };
}

function pathCandidateKeys(source: EvidenceSource): string[] {
  switch (source.kind) {
    case 'external_ai_session':
    case 'external_file':
      return ['path', 'local_path'];
    case 'project':
      return ['readme_path', 'path'];
    case 'task':
      return ['path', 'rel_path'];
    case 'library_item':
      return ['path', 'local_path'];
    default:
      return ['path', 'rel_path'];
  }
}

async function firstExistingPath(
  vaultPath: string,
  source: EvidenceSource,
  keys: string[]
): Promise<{ absolute: string } | null> {
  const candidates: string[] = [];
  for (const key of keys) {
    const value = metadataString(source, key);
    if (value) candidates.push(value);
  }
  candidates.push(source.canonical_ref);

  for (const candidate of candidates) {
    const absolute = normalizePathCandidate(vaultPath, candidate);
    if (!absolute) continue;
    if (await pathExists(absolute)) return { absolute };
  }
  return null;
}

function normalizePathCandidate(vaultPath: string, candidate: string): string | null {
  if (!candidate.trim() || firstUrl(candidate)) return null;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(candidate) && !path.isAbsolute(candidate)) return null;
  return path.resolve(path.isAbsolute(candidate) ? candidate : path.join(vaultPath, candidate));
}

async function pathExists(file: string): Promise<boolean> {
  return fs.stat(file).then(() => true).catch(() => false);
}

function unavailableTarget(
  selector: EvidenceSelector,
  reason: string,
  source?: EvidenceSource
): EvidenceNavigationTarget {
  return {
    kind: 'unavailable',
    source_id: selector.source_id,
    ...(source ? { source_kind: source.kind, title: source.title } : {}),
    selector,
    label: source?.title ?? shortSourceId(selector.source_id),
    available: false,
    range: selector.range,
    reason
  };
}

function targetBase(source: EvidenceSource, selector: EvidenceSelector): Omit<EvidenceNavigationTarget, 'kind' | 'available'> {
  return {
    source_id: source.id,
    source_kind: source.kind,
    title: source.title,
    label: source.title || shortSourceId(source.id),
    selector,
    range: selector.range
  };
}

function metadataString(source: EvidenceSource, key: string): string | null {
  const value = source.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function firstUrl(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && /^https?:\/\//iu.test(value)) return value;
  }
  return null;
}

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function shortSourceId(sourceId: string): string {
  const id = sourceId.split(':').slice(-2).join(':') || sourceId;
  return id.length > 28 ? `${id.slice(0, 28)}...` : id;
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
