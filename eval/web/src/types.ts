export interface EvalRunSummary {
  runId: string;
  createdAt: string;
  completedAt: string;
  mode: string;
  suites: SuiteSummary[];
  git: {
    sha: string;
    dirty: boolean;
  };
  notes: string[];
}

export interface SuiteSummary {
  suite: 'longmemeval' | 'personamem';
  split: string;
  total: number;
  correct: number;
  accuracy: number;
  avgScore: number;
  avgLatencyMs: number;
  avgEvidenceCount: number;
  avgMemoryCount: number;
  byType: Array<{
    key: string;
    total: number;
    correct: number;
    accuracy: number;
    avgScore: number;
  }>;
}

export interface ResultsIndex {
  version: 1;
  latestRunId: string;
  runs: EvalRunSummary[];
}

export interface EvalCaseResult {
  suite: 'longmemeval' | 'personamem';
  split: string;
  mode: string;
  questionId: string;
  questionType?: string;
  topic?: string;
  question: string;
  goldAnswer?: string;
  answer: string;
  score: {
    correct: boolean;
    score: number;
    exactMatch?: boolean;
    tokenF1?: number;
    answerInContext?: boolean;
    selectedOption?: string;
    correctOption?: string;
    sessionRecallAt5?: number;
    memoryCount: number;
    evidenceCount: number;
  };
  latencyMs: number;
  evidenceHits: Array<{
    sourceId: string;
    title: string;
    score: number;
    why: string;
    text: string;
  }>;
  memoryRefs: Array<{
    id: string;
    title: string;
    summary: string;
    confidence: number;
    stability: string;
  }>;
  contextSectionKinds: string[];
  metadata: Record<string, unknown>;
}
