import type {
  ApplyUserEditInput,
  EnsureSynthesisInput,
  SynthesisArtifact,
  SynthesisFilter
} from './types';

export interface SynthesisApiContract {
  get(scopeKey: string): Promise<SynthesisArtifact | null>;
  getArtifact(artifactId: string): Promise<SynthesisArtifact | null>;
  getMany(scopeKeys: string[]): Promise<Record<string, SynthesisArtifact | null>>;
  list(filter?: SynthesisFilter): Promise<SynthesisArtifact[]>;
  ensure(input: EnsureSynthesisInput): Promise<SynthesisArtifact>;
  recompute(scopeKey: string, options?: { force?: boolean }): Promise<SynthesisArtifact>;
  markStale(scopeKey: string, reason?: string): Promise<SynthesisArtifact | null>;
  applyUserEdit(input: ApplyUserEditInput): Promise<SynthesisArtifact>;
}

