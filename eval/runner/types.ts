import type { ContextPacket } from '../../src/shared/context';
import type { MemoryNode, RecallResult } from '../../src/shared/memory';

export type EvalSuite = 'longmemeval' | 'personamem';
export type EvalMode = 'orbit-current' | 'hy-memory';

export interface DatasetFile {
  name: string;
  url: string;
  path: string;
  size?: number;
}

export interface DatasetSpec {
  suite: EvalSuite;
  split: string;
  files: DatasetFile[];
}

export interface EvalRunOptions {
  suite: EvalSuite | 'both';
  mode: EvalMode;
  longmemevalSplit: string;
  personamemSplit: string;
  limit?: number;
  concurrency: number;
  dataDir: string;
  runsDir: string;
  webResultsDir: string;
  keepVaults: boolean;
  hyMemoryServerUrl: string;
  hyMemoryPort: number;
  hyMemoryPythonPath?: string;
  hyMemoryAutoStart: boolean;
  hyMemoryTopK: number;
  hyMemoryMinScore: number;
  hyMemoryUserPrefix: string;
  hyMemoryEnableAgent: boolean;
  hyMemoryLocalEmbed: boolean;
  keepHyMemories: boolean;
}

export interface DatasetQuestion {
  suite: EvalSuite;
  questionId: string;
  questionType?: string;
  topic?: string;
  question: string;
  answer?: string;
  options?: PersonaOption[];
  correctOption?: string;
  contextId?: string;
  endIndex?: number;
  raw: unknown;
}

export interface PersonaOption {
  label: string;
  text: string;
}

export interface ConversationSession {
  id: string;
  date?: string;
  turns: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
    hasAnswer?: boolean;
  }>;
}

export interface LoadedEvalCase {
  question: DatasetQuestion;
  sessions: ConversationSession[];
  goldSessionIds: string[];
  metadata: Record<string, unknown>;
}

export interface OrbitEvalOutput {
  answer: string;
  selectedOption?: string;
  packet: ContextPacket;
  recall: RecallResult;
  memories: MemoryNode[];
  evidenceHits: EvidenceHit[];
  latencyMs: number;
  vaultPath: string;
}

export interface EvidenceHit {
  sourceId: string;
  title: string;
  score: number;
  why: string;
  text: string;
}

export interface CaseScore {
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
}

export interface EvalCaseResult {
  suite: EvalSuite;
  split: string;
  mode: EvalMode;
  questionId: string;
  questionType?: string;
  topic?: string;
  question: string;
  goldAnswer?: string;
  answer: string;
  score: CaseScore;
  latencyMs: number;
  evidenceHits: EvidenceHit[];
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

export interface EvalRunSummary {
  runId: string;
  createdAt: string;
  completedAt: string;
  mode: EvalMode;
  suites: Array<{
    suite: EvalSuite;
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
  }>;
  git: {
    sha: string;
    dirty: boolean;
  };
  notes: string[];
}
