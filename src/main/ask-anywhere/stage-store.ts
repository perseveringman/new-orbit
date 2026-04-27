import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Artifact, ConversationStage } from '@shared/stage';

export class StageStore {
  constructor(private readonly vaultPath: string) {}

  async get(conversationId: string): Promise<ConversationStage> {
    try {
      const stage = JSON.parse(await fs.readFile(this.stagePath(conversationId), 'utf8')) as ConversationStage;
      return {
        conversation_id: conversationId,
        artifacts: stage.artifacts ?? [],
        last_updated: stage.last_updated ?? new Date(0).toISOString()
      };
    } catch (error) {
      if (!isNotFound(error)) throw error;
      return { conversation_id: conversationId, artifacts: [], last_updated: new Date(0).toISOString() };
    }
  }

  async add(
    conversationId: string,
    artifact: Omit<Artifact, 'id' | 'conversation_id' | 'created_at'> & Partial<Pick<Artifact, 'id' | 'created_at'>>
  ): Promise<Artifact> {
    const stage = await this.get(conversationId);
    const next: Artifact = {
      ...artifact,
      id: artifact.id ?? `artifact-${randomUUID()}`,
      conversation_id: conversationId,
      created_at: artifact.created_at ?? new Date().toISOString()
    };
    const index = stage.artifacts.findIndex((item) => item.id === next.id);
    if (index >= 0) stage.artifacts[index] = next;
    else stage.artifacts.push(next);
    await this.write({ ...stage, artifacts: stage.artifacts, last_updated: new Date().toISOString() });
    return next;
  }

  async remove(conversationId: string, artifactId: string): Promise<void> {
    const stage = await this.get(conversationId);
    await this.write({
      ...stage,
      artifacts: stage.artifacts.filter((artifact) => artifact.id !== artifactId),
      last_updated: new Date().toISOString()
    });
  }

  async markAction(conversationId: string, artifactId: string, actionId: string): Promise<void> {
    const stage = await this.get(conversationId);
    await this.write({
      ...stage,
      artifacts: stage.artifacts.map((artifact) =>
        artifact.id === artifactId && actionId === 'reject'
          ? { ...artifact, status: 'rejected' as const }
          : artifact.id === artifactId && actionId === 'confirm'
            ? { ...artifact, status: 'confirmed' as const }
            : artifact
      ),
      last_updated: new Date().toISOString()
    });
  }

  private stagePath(conversationId: string): string {
    return path.join(this.vaultPath, '.orbit', 'conversations', conversationId, 'stage.json');
  }

  private async write(stage: ConversationStage): Promise<void> {
    await fs.mkdir(path.dirname(this.stagePath(stage.conversation_id)), { recursive: true });
    await fs.writeFile(this.stagePath(stage.conversation_id), `${JSON.stringify(stage, null, 2)}\n`, 'utf8');
  }
}

export function createStageStore(vaultPath: string): StageStore {
  return new StageStore(vaultPath);
}

export function extractArtifactFences(text: string): Array<Omit<Artifact, 'id' | 'conversation_id' | 'created_at'> & Partial<Pick<Artifact, 'id' | 'created_at'>>> {
  const artifacts: Array<Omit<Artifact, 'id' | 'conversation_id' | 'created_at'> & Partial<Pick<Artifact, 'id' | 'created_at'>>> = [];
  for (const match of text.matchAll(/```artifact\s*([\s\S]*?)```/g)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Partial<Artifact>;
      if (parsed.kind && parsed.title) {
        artifacts.push({
          kind: parsed.kind,
          title: parsed.title,
          summary: parsed.summary,
          refs: parsed.refs,
          payload: parsed.payload ?? parsed,
          status: parsed.status ?? 'confirmed',
          actions: parsed.actions
        });
      }
    } catch {
      /* ignore malformed inline artifact fences */
    }
  }
  return artifacts;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

