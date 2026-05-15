import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import type {
  EvidenceAvailability,
  EvidenceRegistryFile,
  EvidenceSource,
  EvidenceSourceFilter
} from '@shared/evidence';

export function evidenceDir(vaultPath: string): string {
  return path.join(vaultPath, ORBIT_DIR, 'evidence');
}

export function evidenceSourcesPath(vaultPath: string): string {
  return path.join(evidenceDir(vaultPath), 'sources.json');
}

export class EvidenceStore {
  constructor(private readonly vaultPath: string) {}

  async get(sourceId: string): Promise<EvidenceSource | null> {
    const registry = await this.readRegistry();
    return registry.sources[sourceId] ?? null;
  }

  async list(filter: EvidenceSourceFilter = {}): Promise<EvidenceSource[]> {
    const registry = await this.readRegistry();
    const query = filter.query?.trim().toLowerCase();
    const sources = Object.values(registry.sources)
      .filter((source) => filter.include_unavailable || source.availability === 'available' || source.availability === 'changed' || source.availability === 'snapshotted')
      .filter((source) => !filter.kind || source.kind === filter.kind)
      .filter((source) => !filter.provider_id || source.provider_id === filter.provider_id)
      .filter((source) => !filter.availability || source.availability === filter.availability)
      .filter((source) => !filter.ownership || source.ownership === filter.ownership)
      .filter((source) => !filter.scope || matchesScope(source, filter.scope))
      .filter((source) => !query || searchableText(source).includes(query))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return sources.slice(0, Math.max(1, filter.limit ?? 500));
  }

  async upsert(source: EvidenceSource): Promise<EvidenceSource> {
    validateSource(source);
    const registry = await this.readRegistry();
    registry.sources[source.id] = source;
    registry.updated_at = new Date().toISOString();
    await this.writeRegistry(registry);
    return source;
  }

  async upsertMany(sources: EvidenceSource[]): Promise<EvidenceSource[]> {
    const registry = await this.readRegistry();
    for (const source of sources) {
      validateSource(source);
      registry.sources[source.id] = source;
    }
    registry.updated_at = new Date().toISOString();
    await this.writeRegistry(registry);
    return sources;
  }

  async replaceProviderSources(providerId: string, sources: EvidenceSource[]): Promise<EvidenceSource[]> {
    const registry = await this.readRegistry();
    const nextIds = new Set(sources.map((source) => source.id));
    const observedAt = new Date().toISOString();

    for (const source of sources) {
      validateSource(source);
      if (source.provider_id !== providerId) {
        throw new Error(`evidence_provider_mismatch:${source.id}`);
      }
    }

    for (const [sourceId, source] of Object.entries(registry.sources)) {
      if (source.provider_id !== providerId || nextIds.has(sourceId)) continue;
      registry.sources[sourceId] = {
        ...source,
        availability: 'missing',
        observed_at: observedAt
      };
    }

    for (const source of sources) {
      const current = registry.sources[source.id];
      registry.sources[source.id] = current && current.fingerprint.value !== source.fingerprint.value
        ? {
            ...source,
            availability: 'changed',
            metadata: {
              ...(source.metadata ?? {}),
              previous_fingerprint: current.fingerprint
            }
          }
        : source;
    }

    registry.updated_at = observedAt;
    await this.writeRegistry(registry);
    return sources;
  }

  async markAvailability(sourceId: string, availability: EvidenceAvailability): Promise<EvidenceSource | null> {
    const registry = await this.readRegistry();
    const source = registry.sources[sourceId];
    if (!source) return null;
    const next: EvidenceSource = {
      ...source,
      availability,
      observed_at: new Date().toISOString()
    };
    registry.sources[sourceId] = next;
    registry.updated_at = next.observed_at;
    await this.writeRegistry(registry);
    return next;
  }

  private async readRegistry(): Promise<EvidenceRegistryFile> {
    try {
      const raw = await fs.readFile(evidenceSourcesPath(this.vaultPath), 'utf8');
      const parsed = JSON.parse(raw) as Partial<EvidenceRegistryFile>;
      return {
        version: 1,
        sources: parsed.sources && typeof parsed.sources === 'object'
          ? (parsed.sources as Record<string, EvidenceSource>)
          : {},
        ...(typeof parsed.updated_at === 'string' ? { updated_at: parsed.updated_at } : {})
      };
    } catch (error) {
      if (isNotFound(error)) return { version: 1, sources: {} };
      throw error;
    }
  }

  private async writeRegistry(registry: EvidenceRegistryFile): Promise<void> {
    const file = evidenceSourcesPath(this.vaultPath);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  }
}

export function createEvidenceStore(vaultPath: string): EvidenceStore {
  return new EvidenceStore(vaultPath);
}

function validateSource(source: EvidenceSource): void {
  if (!source.id || !source.kind || !source.title || !source.provider_id || !source.canonical_ref) {
    throw new Error('invalid_evidence_source');
  }
  if (!source.updated_at || !source.observed_at || !source.fingerprint?.value || !source.privacy?.index_level) {
    throw new Error(`invalid_evidence_source:${source.id}`);
  }
}

function searchableText(source: EvidenceSource): string {
  return [source.title, source.summary, source.canonical_ref, source.provider_id, source.kind]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

function matchesScope(source: EvidenceSource, scope: NonNullable<EvidenceSourceFilter['scope']>): boolean {
  return source.scope_refs?.some((candidate) => candidate.kind === scope.kind && candidate.ref === scope.ref) ?? false;
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT');
}
