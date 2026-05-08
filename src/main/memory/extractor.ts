import type { Conversation } from '@shared/conversation';
import type { CreateMemoryInput, MemoryExtractionInput, MemoryKind } from '@shared/memory';
import type { SynthesisSource } from '@shared/synthesis';

export function extractFromConversation(conversation: Conversation): MemoryExtractionInput {
  return {
    source_kind: 'conversation',
    source_ref: conversation.id,
    content: conversation.turns.slice(-30).map((turn) => `${turn.role}: ${turn.content}`).join('\n')
  };
}

export function extractMemoryCandidates(input: MemoryExtractionInput): CreateMemoryInput[] {
  const source: SynthesisSource = {
    kind: input.source_kind === 'conversation' ? 'conversation' : input.source_kind === 'review' ? 'raw' : 'timeline_range',
    ref: input.source_ref,
    title: `${input.source_kind}:${input.source_ref}`,
    excerpt: input.content.slice(0, 500)
  };
  return splitSentences(input.content)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 18)
    .map((sentence) => candidateFromSentence(sentence, source))
    .filter((candidate): candidate is CreateMemoryInput => Boolean(candidate))
    .slice(0, 5);
}

function candidateFromSentence(sentence: string, source: SynthesisSource): CreateMemoryInput | null {
  const lower = sentence.toLowerCase();
  const kind = classifyKind(lower);
  if (!kind) return null;
  const summary = sentence.replace(/^(user|assistant|system):\s*/i, '').slice(0, 220);
  return {
    kind,
    title: titleFromSummary(summary, kind),
    summary,
    detail: sentence,
    sources: [source],
    evidence_count: 1,
    confidence: kind === 'preference' || kind === 'goal' ? 0.65 : 0.55,
    related_entities: relatedEntities(sentence)
  };
}

function classifyKind(lower: string): MemoryKind | null {
  if (/\b(prefer|preference|likes?|usually wants|希望|偏好)\b/u.test(lower)) return 'preference';
  if (/\b(lesson|learned|avoid|next time|教训|下次)\b/u.test(lower)) return 'lesson';
  if (/\b(goal|objective|this quarter|want to finish|目标|想完成)\b/u.test(lower)) return 'goal';
  if (/\b(always|usually|pattern|habit|typically|通常|模式)\b/u.test(lower)) return 'pattern';
  if (/\b(interested in|关注|持续关注|curious about)\b/u.test(lower)) return 'interest';
  if (/\b(resource:|project:|area:|note:|library:)\b/u.test(lower)) return 'entity_memory';
  return null;
}

function splitSentences(content: string): string[] {
  return content.split(/(?<=[.!?。！？])\s+|\n+/u);
}

function titleFromSummary(summary: string, kind: MemoryKind): string {
  const cleaned = summary.replace(/["'`*_#>[\]()]/g, '').trim();
  return (cleaned.split(/\s+/u).slice(0, 8).join(' ') || kind).slice(0, 80);
}

function relatedEntities(sentence: string): string[] {
  return Array.from(sentence.matchAll(/\b(note|library|resource|project|area|conversation):([a-zA-Z0-9_.:-]+)/g)).map((match) => `${match[1]}:${match[2]}`);
}
