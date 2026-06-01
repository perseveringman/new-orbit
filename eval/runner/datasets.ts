import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ConversationSession, DatasetQuestion, DatasetSpec, EvalSuite, LoadedEvalCase, PersonaOption } from './types';
import { parseCsv } from './csv';

const LONGMEMEVAL_BASE = 'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main';
const PERSONAMEM_BASE = 'https://huggingface.co/datasets/bowen-upenn/PersonaMem-v1/resolve/main';

export function datasetSpec(suite: EvalSuite, split: string, dataDir: string): DatasetSpec {
  if (suite === 'longmemeval') {
    const file = split === 'oracle' ? 'longmemeval_oracle.json' : `longmemeval_${split}.json`;
    return {
      suite,
      split,
      files: [
        {
          name: file,
          url: `${LONGMEMEVAL_BASE}/${file}`,
          path: path.join(dataDir, 'longmemeval', file)
        }
      ]
    };
  }
  const suffix = split.toLowerCase();
  return {
    suite,
    split,
    files: [
      {
        name: `questions_${suffix}.csv`,
        url: `${PERSONAMEM_BASE}/questions_${suffix}.csv`,
        path: path.join(dataDir, 'personamem', `questions_${suffix}.csv`)
      },
      {
        name: `shared_contexts_${suffix}.jsonl`,
        url: `${PERSONAMEM_BASE}/shared_contexts_${suffix}.jsonl`,
        path: path.join(dataDir, 'personamem', `shared_contexts_${suffix}.jsonl`)
      }
    ]
  };
}

export async function ensureDataset(spec: DatasetSpec): Promise<void> {
  for (const file of spec.files) {
    await fs.mkdir(path.dirname(file.path), { recursive: true });
    const exists = await fs.stat(file.path).catch(() => null);
    if (exists?.size) continue;
    await downloadFile(file.url, file.path);
  }
}

export async function loadCases(suite: EvalSuite, split: string, dataDir: string, limit?: number): Promise<LoadedEvalCase[]> {
  if (suite === 'longmemeval') return loadLongMemEval(split, dataDir, limit);
  return loadPersonaMem(split, dataDir, limit);
}

async function loadLongMemEval(split: string, dataDir: string, limit?: number): Promise<LoadedEvalCase[]> {
  const spec = datasetSpec('longmemeval', split, dataDir);
  const file = spec.files[0].path;
  const raw = JSON.parse(await fs.readFile(file, 'utf8')) as LongMemEvalRaw[];
  return raw.slice(0, limit ?? raw.length).map((item) => {
    const ids = item.haystack_session_ids ?? [];
    const dates = item.haystack_dates ?? [];
    const sessions: ConversationSession[] = item.haystack_sessions.map((turns, index) => ({
      id: ids[index] ?? `session-${index}`,
      date: dates[index],
      turns: turns.map((turn) => ({
        role: normalizeRole(turn.role),
        content: turn.content,
        hasAnswer: turn.has_answer
      }))
    }));
    return {
      question: {
        suite: 'longmemeval',
        questionId: item.question_id,
        questionType: item.question_type,
        question: item.question,
        answer: String(item.answer),
        raw: item
      },
      sessions,
      goldSessionIds: ids.filter((id) => id.includes('answer_')),
      metadata: {
        rawAnswer: item.answer,
        questionDate: item.question_date,
        haystackDates: dates,
        haystackSessionIds: ids
      }
    };
  });
}

async function loadPersonaMem(split: string, dataDir: string, limit?: number): Promise<LoadedEvalCase[]> {
  const spec = datasetSpec('personamem', split, dataDir);
  const questionsFile = spec.files.find((file) => file.name.endsWith('.csv'))?.path;
  const contextsFile = spec.files.find((file) => file.name.endsWith('.jsonl'))?.path;
  if (!questionsFile || !contextsFile) throw new Error(`missing_personamem_files:${split}`);
  const rows = parseCsv(await fs.readFile(questionsFile, 'utf8'));
  const contexts = await loadPersonaContexts(contextsFile);
  return rows.slice(0, limit ?? rows.length).map((row) => {
    const contextId = row['shared_context_id'];
    const endIndex = Number.parseInt(row['end_index_in_shared_context'] ?? '', 10);
    const turns = (contexts.get(contextId) ?? []).slice(0, Number.isFinite(endIndex) ? endIndex : undefined);
    const options = parsePersonaOptions(row['all_options']);
    const question: DatasetQuestion = {
      suite: 'personamem',
      questionId: row['question_id'],
      questionType: row['question_type'],
      topic: row['topic'],
      question: row['user_question_or_message'],
      answer: row['correct_answer'],
      options,
      correctOption: optionLabel(row['correct_answer']),
      contextId,
      endIndex: Number.isFinite(endIndex) ? endIndex : undefined,
      raw: row
    };
    return {
      question,
      sessions: [
        {
          id: contextId,
          turns: turns.map((turn) => ({
            role: normalizeRole(turn.role),
            content: turn.content
          }))
        }
      ],
      goldSessionIds: [contextId],
      metadata: {
        personaId: row['persona_id'],
        contextLengthTokens: numberOrNull(row['context_length_in_tokens']),
        distanceToRefTokens: numberOrNull(row['distance_to_ref_in_tokens']),
        distanceToRefBlocks: numberOrNull(row['distance_to_ref_in_blocks']),
        distanceProportion: row['distance_to_ref_proportion_in_context']
      }
    };
  });
}

async function loadPersonaContexts(file: string): Promise<Map<string, PersonaTurn[]>> {
  const out = new Map<string, PersonaTurn[]>();
  const raw = await fs.readFile(file, 'utf8');
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const parsed = JSON.parse(line) as Record<string, PersonaTurn[]>;
    for (const [id, turns] of Object.entries(parsed)) out.set(id, turns);
  }
  return out;
}

function parsePersonaOptions(raw: string): PersonaOption[] {
  const parsed = parseLooseList(raw);
  return parsed.map((text, index) => {
    const label = text.match(/^\(([a-d])\)/i)?.[1]?.toLowerCase() ?? String.fromCharCode(97 + index);
    return { label, text };
  });
}

function parseLooseList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // Some rows use Python single-quoted lists.
  }
  const items: string[] = [];
  const pattern = /['"](\([a-d]\)[\s\S]*?)(?=['"],\s*['"]\([a-d]\)|['"]\]$)/g;
  for (const match of raw.matchAll(pattern)) items.push(match[1].replace(/\\'/g, "'").replace(/\\"/g, '"'));
  if (items.length) return items;
  return raw.split(/,\s*(?=['"]?\([a-d]\))/i).map((item) => item.replace(/^\[?['"]?|['"]?\]?$/g, '').trim()).filter(Boolean);
}

function optionLabel(raw: string | undefined): string | undefined {
  return raw?.match(/\(([a-d])\)/i)?.[1]?.toLowerCase();
}

function numberOrNull(value: string | undefined): number | null {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRole(role: string): 'system' | 'user' | 'assistant' {
  if (role === 'system') return 'system';
  if (role === 'assistant') return 'assistant';
  return 'user';
}

async function downloadFile(url: string, target: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download_failed:${response.status}:${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(target, buffer);
}

interface LongMemEvalRaw {
  question_id: string;
  question_type: string;
  question: string;
  answer: string | number | boolean | null;
  question_date?: string;
  haystack_dates?: string[];
  haystack_session_ids?: string[];
  haystack_sessions: Array<Array<{ role: string; content: string; has_answer?: boolean }>>;
}

interface PersonaTurn {
  role: string;
  content: string;
}
