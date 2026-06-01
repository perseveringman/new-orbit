import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildContextPacket } from '../../src/main/context/packet-builder';
import { ConversationStore } from '../../src/main/conversation/store';
import { createEvidenceChunkIndexStore } from '../../src/main/evidence/chunk-index';
import { extractFromConversation, extractMemoryCandidates } from '../../src/main/memory/extractor';
import { recallContext } from '../../src/main/memory/recall-service';
import { createMemoryStore } from '../../src/main/memory/store';
import type { Conversation } from '../../src/shared/conversation';
import type { ConversationSession, EvidenceHit, LoadedEvalCase, OrbitEvalOutput } from './types';
import { answerLongMemEval, answerPersona } from './answering';

export async function runOrbitCurrentCase(loaded: LoadedEvalCase, options: { keepVaults: boolean }): Promise<OrbitEvalOutput> {
  const start = Date.now();
  const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), `orbit-eval-${loaded.question.suite}-`));
  await seedConversations(vaultPath, loaded.sessions);
  await seedCurrentMemories(vaultPath);
  await createEvidenceChunkIndexStore(vaultPath).rebuild({ includeActivities: false });

  const packet = await buildContextPacket(vaultPath, {
    purpose: 'ask',
    scope: { kind: 'global' },
    query: loaded.question.question,
    evidence_limit: 10,
    graph_limit: 8,
    max_tokens: 3200,
    synthesis_mode: 'lookup'
  });
  const recall = await recallContext(vaultPath, loaded.question.question, {
    max_memories: 8,
    min_confidence: 0.4,
    triggered_by: { kind: 'ask', ref: loaded.question.questionId },
    used_in: 'context_injection'
  });
  const evidenceHits = await collectEvidenceHits(vaultPath, loaded.question.question);
  const answer = loaded.question.suite === 'personamem'
    ? answerPersona(loaded.question.question, loaded.question.options ?? [], packet, evidenceHits, recall.memories.map((memory) => memory.summary))
    : answerLongMemEval(loaded.question.question, packet, evidenceHits, recall.memories.map((memory) => memory.summary));

  if (!options.keepVaults) await fs.rm(vaultPath, { recursive: true, force: true });
  return {
    answer: answer.text,
    ...(answer.option ? { selectedOption: answer.option } : {}),
    packet,
    recall,
    memories: recall.memories,
    evidenceHits,
    latencyMs: Date.now() - start,
    vaultPath
  };
}

async function seedConversations(vaultPath: string, sessions: ConversationSession[]): Promise<void> {
  const store = new ConversationStore(vaultPath);
  for (const session of sessions) {
    const conversationId = safeConversationId(session.id);
    await store.create({
      id: conversationId,
      anchors: [
        {
          kind: 'ask_anywhere_session',
          refId: session.id,
          addedAt: session.date ?? new Date().toISOString()
        }
      ],
      title: session.id,
      scope: { kind: 'global' },
      tags: ['eval', 'memory']
    });
    for (const [index, turn] of session.turns.entries()) {
      await store.appendTurn(conversationId, {
        id: `turn-${index}-${randomUUID().slice(0, 8)}`,
        at: session.date ?? new Date(Date.now() + index).toISOString(),
        role: turn.role === 'system' ? 'system' : turn.role,
        content: turn.content
      });
    }
  }
}

async function seedCurrentMemories(vaultPath: string): Promise<void> {
  const conversationStore = new ConversationStore(vaultPath);
  const memoryStore = createMemoryStore(vaultPath);
  const metas = await conversationStore.list();
  for (const meta of metas) {
    const conversation = await conversationStore.get(meta.id);
    if (!conversation) continue;
    const candidates = extractMemoryCandidates(extractFromConversation(conversation as Conversation));
    for (const candidate of candidates) {
      await memoryStore.create(candidate).catch(() => null);
    }
  }
}

async function collectEvidenceHits(vaultPath: string, question: string): Promise<EvidenceHit[]> {
  const hits = await createEvidenceChunkIndexStore(vaultPath).search({ query: question, limit: 12 });
  return hits.map((hit) => ({
    sourceId: hit.chunk.source_id,
    title: hit.chunk.title,
    score: hit.score,
    why: hit.why,
    text: hit.chunk.text
  }));
}

function safeConversationId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || `eval-${randomUUID().slice(0, 8)}`;
}
