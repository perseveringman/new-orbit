import type { Note } from './note';

export type KnowledgeBaseSourceType = 'obsidian' | 'markdown-folder' | 'notion-export' | 'generic';
export type KnowledgeBaseIndexStatus = 'pending' | 'indexing' | 'ready' | 'error';

export interface KnowledgeBase {
  id: string;
  name: string;
  path: string;
  source_type: KnowledgeBaseSourceType;
  imported_at: string;
  last_scanned_at?: string;
  writable: boolean;
  index_status: KnowledgeBaseIndexStatus;
  item_count: number;
  description?: string;
  welcome_analysis_done: boolean;
}

export interface ImportKnowledgeBaseInput {
  name: string;
  sourcePath: string;
  sourceType: KnowledgeBaseSourceType;
  writable?: boolean;
}

export interface KnowledgeBaseSearchHit {
  kbId: string;
  path: string;
  title: string;
  excerpt: string;
  score: number;
}

export interface ActivateKnowledgeBaseInput {
  kbId: string;
  sourceFile: string;
  excerpt: string;
  targetType?: 'thought' | 'capture';
  userText?: string;
}

export interface WelcomeAnalysisResult {
  generated_at: string;
  kb_ids: string[];
  headline: string;
  summary: string;
  suggested_resources: Array<{ title: string; reason: string; source_refs: string[] }>;
  suggested_areas: Array<{ title: string; reason: string }>;
  suggested_projects: Array<{ title: string; reason: string }>;
  artifact_note?: Note;
}

export interface OnboardingStatus {
  hasKnowledgeBase: boolean;
  welcomeAnalysisDone: boolean;
  nextStep: 'import_kb' | 'welcome_analysis' | 'ready';
}

