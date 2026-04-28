import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  SynthesisArtifact,
  SynthesisDLQEntry,
  SynthesisFilter,
  SynthesisJob,
  SynthesisKind,
  SynthesisProvenance,
  SynthesisSource
} from '@shared/synthesis';
import { publishTraceableEvent } from '../events/bus';
import {
  artifactPath,
  dlqPath,
  readSynthesisIndex,
  scopePointerKey,
  synthesisArtifactsDir,
  synthesisDlqDir,
  writeSynthesisIndex
} from './index-file';

export class SynthesisStore {
  constructor(private readonly vaultPath: string) {}

  async latest(scopeKey: string): Promise<SynthesisArtifact | null> {
    const index = await readSynthesisIndex(this.vaultPath);
    const artifactId = index.latest[scopePointerKey(scopeKey)];
    return artifactId ? this.get(artifactId) : null;
  }

  async get(artifactId: string): Promise<SynthesisArtifact | null> {
    try {
      return normalizeArtifact(JSON.parse(await fs.readFile(artifactPath(this.vaultPath, artifactId), 'utf8')));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async getMany(scopeKeys: string[]): Promise<Record<string, SynthesisArtifact | null>> {
    const entries = await Promise.all(scopeKeys.map(async (scopeKey) => [scopeKey, await this.latest(scopeKey)] as const));
    return Object.fromEntries(entries);
  }

  async list(filter: SynthesisFilter = {}): Promise<SynthesisArtifact[]> {
    await fs.mkdir(synthesisArtifactsDir(this.vaultPath), { recursive: true });
    const files = await fs.readdir(synthesisArtifactsDir(this.vaultPath)).catch((error: unknown) => {
      if (isNotFound(error)) return [];
      throw error;
    });
    const artifacts = await Promise.all(
      files
        .filter((file) => file.endsWith('.json'))
        .map((file) => fs.readFile(path.join(synthesisArtifactsDir(this.vaultPath), file), 'utf8').then((raw) => normalizeArtifact(JSON.parse(raw))))
    );
    return artifacts
      .filter((artifact) => !filter.kind || artifact.kind === filter.kind)
      .filter((artifact) => !filter.scope_key || artifact.scope_key === filter.scope_key)
      .filter((artifact) => !filter.status || artifact.status === filter.status)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, Math.max(1, filter.limit ?? 200));
  }

  async writeFresh(input: {
    kind: SynthesisKind;
    scope_key: string;
    sources: SynthesisSource[];
    provenance: SynthesisProvenance;
    payload: unknown;
  }): Promise<SynthesisArtifact> {
    const current = await this.latest(input.scope_key);
    const now = new Date().toISOString();
    const artifact: SynthesisArtifact = {
      id: `synth-${randomUUID()}`,
      kind: input.kind,
      scope_key: input.scope_key,
      sources: input.sources,
      provenance: input.provenance,
      payload: input.payload,
      status: 'fresh',
      created_at: now
    };
    await this.writeArtifact(artifact);
    if (current) await this.supersede(current.id, artifact.id);
    const index = await readSynthesisIndex(this.vaultPath);
    index.latest[scopePointerKey(input.scope_key)] = artifact.id;
    await writeSynthesisIndex(this.vaultPath, index);
    publishSynthesisEvent('synthesis.artifact.created', artifact);
    return artifact;
  }

  async writeFailed(input: {
    kind: SynthesisKind;
    scope_key: string;
    sources: SynthesisSource[];
    provenance: SynthesisProvenance;
    error: string;
    payload?: unknown;
  }): Promise<SynthesisArtifact> {
    const artifact: SynthesisArtifact = {
      id: `synth-${randomUUID()}`,
      kind: input.kind,
      scope_key: input.scope_key,
      sources: input.sources,
      provenance: input.provenance,
      payload: input.payload ?? null,
      status: 'failed',
      created_at: new Date().toISOString(),
      error: input.error
    };
    await this.writeArtifact(artifact);
    publishSynthesisEvent('synthesis.artifact.failed', artifact, { error: input.error });
    return artifact;
  }

  async markStale(scopeKey: string, reason?: string): Promise<SynthesisArtifact | null> {
    const current = await this.latest(scopeKey);
    if (!current || current.status !== 'fresh') return current;
    const next: SynthesisArtifact = {
      ...current,
      status: 'stale',
      invalidated_at: new Date().toISOString(),
      ...(reason ? { error: reason } : {})
    };
    await this.writeArtifact(next);
    publishSynthesisEvent('synthesis.artifact.stale', next, reason ? { error: reason } : {});
    return next;
  }

  async applyUserEdit(artifactId: string, payload: unknown): Promise<SynthesisArtifact> {
    const current = await this.get(artifactId);
    if (!current) throw new Error(`synthesis_artifact_not_found:${artifactId}`);
    const next: SynthesisArtifact = {
      ...current,
      payload,
      user_edited: true
    };
    await this.writeArtifact(next);
    publishSynthesisEvent('synthesis.artifact.user_edited', next);
    return next;
  }

  async pushDlq(job: SynthesisJob, error: string, rawOutput?: string): Promise<SynthesisDLQEntry> {
    const entry: SynthesisDLQEntry = {
      id: `failed-job-${randomUUID()}`,
      job,
      error,
      at: new Date().toISOString(),
      ...(rawOutput ? { raw_output: rawOutput } : {})
    };
    await fs.mkdir(synthesisDlqDir(this.vaultPath), { recursive: true });
    await fs.writeFile(dlqPath(this.vaultPath, entry.id), `${JSON.stringify(entry, null, 2)}\n`, 'utf8');
    return entry;
  }

  private async supersede(artifactId: string, supersededBy: string): Promise<void> {
    const current = await this.get(artifactId);
    if (!current || current.status === 'superseded') return;
    const next: SynthesisArtifact = {
      ...current,
      status: 'superseded',
      superseded_by: supersededBy
    };
    await this.writeArtifact(next);
    publishSynthesisEvent('synthesis.artifact.superseded', next, { superseded_by: supersededBy });
  }

  private async writeArtifact(artifact: SynthesisArtifact): Promise<void> {
    if (!artifact.provenance?.prompt_version) throw new Error('synthesis_provenance_required');
    await fs.mkdir(synthesisArtifactsDir(this.vaultPath), { recursive: true });
    await fs.writeFile(artifactPath(this.vaultPath, artifact.id), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  }
}

export function createSynthesisStore(vaultPath: string): SynthesisStore {
  return new SynthesisStore(vaultPath);
}

function normalizeArtifact(value: unknown): SynthesisArtifact {
  const artifact = value as SynthesisArtifact;
  if (!artifact?.id || !artifact.kind || !artifact.scope_key || !artifact.provenance?.prompt_version) {
    throw new Error('invalid_synthesis_artifact');
  }
  return artifact;
}

function publishSynthesisEvent(
  kind: 'synthesis.artifact.created' | 'synthesis.artifact.stale' | 'synthesis.artifact.superseded' | 'synthesis.artifact.failed' | 'synthesis.artifact.user_edited',
  artifact: SynthesisArtifact,
  extra: { superseded_by?: string; error?: string } = {}
): void {
  publishTraceableEvent({
    source: 'synthesis',
    kind,
    summary: `${artifact.kind} ${artifact.status}: ${artifact.scope_key}`,
    payload: {
      artifact_id: artifact.id,
      kind: artifact.kind,
      scope_key: artifact.scope_key,
      status: artifact.status,
      ...extra
    }
  });
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT');
}

