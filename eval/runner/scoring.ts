import type { CaseScore, EvalCaseResult, EvalMode, EvalSuite, LoadedEvalCase, OrbitEvalOutput } from './types';
import { normalizeText, round, tokenF1 } from './text';

export function scoreCase(input: {
  loaded: LoadedEvalCase;
  output: OrbitEvalOutput;
  suite: EvalSuite;
  split: string;
  mode: EvalMode;
}): EvalCaseResult {
  const score = input.suite === 'personamem'
    ? scorePersonaMem(input.loaded, input.output)
    : scoreLongMemEval(input.loaded, input.output);
  return {
    suite: input.suite,
    split: input.split,
    mode: input.mode,
    questionId: input.loaded.question.questionId,
    questionType: input.loaded.question.questionType,
    topic: input.loaded.question.topic,
    question: input.loaded.question.question,
    goldAnswer: input.loaded.question.answer,
    answer: input.output.answer,
    score,
    latencyMs: input.output.latencyMs,
    evidenceHits: input.output.evidenceHits.slice(0, 8),
    memoryRefs: input.output.memories.slice(0, 8).map((memory) => ({
      id: memory.id,
      title: memory.title,
      summary: memory.summary,
      confidence: memory.confidence,
      stability: memory.stability
    })),
    contextSectionKinds: input.output.packet.sections.map((section) => section.kind),
    metadata: input.loaded.metadata
  };
}

export function aggregateResults(results: EvalCaseResult[]): {
  total: number;
  correct: number;
  accuracy: number;
  avgScore: number;
  avgLatencyMs: number;
  avgEvidenceCount: number;
  avgMemoryCount: number;
  byType: Array<{ key: string; total: number; correct: number; accuracy: number; avgScore: number }>;
} {
  const total = results.length;
  const correct = results.filter((result) => result.score.correct).length;
  const groups = new Map<string, EvalCaseResult[]>();
  for (const result of results) {
    const key = result.questionType ?? result.topic ?? 'unknown';
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  return {
    total,
    correct,
    accuracy: total ? round(correct / total) : 0,
    avgScore: average(results.map((result) => result.score.score)),
    avgLatencyMs: average(results.map((result) => result.latencyMs)),
    avgEvidenceCount: average(results.map((result) => result.score.evidenceCount)),
    avgMemoryCount: average(results.map((result) => result.score.memoryCount)),
    byType: Array.from(groups.entries())
      .map(([key, items]) => ({
        key,
        total: items.length,
        correct: items.filter((result) => result.score.correct).length,
        accuracy: items.length ? round(items.filter((result) => result.score.correct).length / items.length) : 0,
        avgScore: average(items.map((result) => result.score.score))
      }))
      .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key))
  };
}

function scoreLongMemEval(loaded: LoadedEvalCase, output: OrbitEvalOutput): CaseScore {
  const gold = loaded.question.answer ?? '';
  const normalizedAnswer = normalizeText(output.answer);
  const normalizedGold = normalizeText(gold);
  const exactMatch = Boolean(normalizedGold && normalizedAnswer === normalizedGold);
  const answerInContext = Boolean(
    normalizedGold &&
    normalizeText([output.answer, ...output.evidenceHits.map((hit) => hit.text), ...output.memories.map((memory) => memory.summary)].join('\n')).includes(normalizedGold)
  );
  const f1 = tokenF1(output.answer, gold);
  const sessionRecallAt5 = sessionRecall(loaded.goldSessionIds, output.evidenceHits.slice(0, 5).map((hit) => hit.sourceId));
  const correct = exactMatch || answerInContext || f1 >= 0.72;
  return {
    correct,
    score: correct ? 1 : f1,
    exactMatch,
    tokenF1: f1,
    answerInContext,
    sessionRecallAt5,
    memoryCount: output.memories.length,
    evidenceCount: output.evidenceHits.length
  };
}

function scorePersonaMem(loaded: LoadedEvalCase, output: OrbitEvalOutput): CaseScore {
  const selected = output.selectedOption;
  const correctOption = loaded.question.correctOption;
  const correct = Boolean(selected && correctOption && selected === correctOption);
  return {
    correct,
    score: correct ? 1 : 0,
    selectedOption: selected,
    correctOption,
    memoryCount: output.memories.length,
    evidenceCount: output.evidenceHits.length
  };
}

function sessionRecall(goldIds: string[], hitSourceIds: string[]): number {
  if (!goldIds.length) return 0;
  const hits = goldIds.filter((id) => hitSourceIds.some((sourceId) => sourceId.includes(id))).length;
  return round(hits / goldIds.length);
}

function average(values: number[]): number {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return 0;
  return round(finite.reduce((sum, value) => sum + value, 0) / finite.length);
}
