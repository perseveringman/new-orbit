import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { EvalCaseResult, EvalMode, EvalRunSummary, EvalSuite } from './types';
import { aggregateResults } from './scoring';
import { safeSegment } from './paths';

const execFileAsync = promisify(execFile);

export async function createRunRecord(input: {
  runsDir: string;
  webResultsDir: string;
  mode: EvalMode;
  startedAt: string;
  suiteResults: Array<{ suite: EvalSuite; split: string; results: EvalCaseResult[] }>;
  notes: string[];
}): Promise<{ runDir: string; summary: EvalRunSummary }> {
  const runId = `${input.startedAt.replace(/[:.]/g, '-')}__${input.mode}`;
  const runDir = path.join(input.runsDir, runId);
  await fs.mkdir(runDir, { recursive: true });

  for (const suite of input.suiteResults) {
    const file = path.join(runDir, `${suite.suite}-${safeSegment(suite.split)}.jsonl`);
    await fs.writeFile(file, suite.results.map((result) => JSON.stringify(result)).join('\n') + '\n', 'utf8');
  }

  const git = await gitState();
  const completedAt = new Date().toISOString();
  const summary: EvalRunSummary = {
    runId,
    createdAt: input.startedAt,
    completedAt,
    mode: input.mode,
    suites: input.suiteResults.map((suite) => ({
      suite: suite.suite,
      split: suite.split,
      ...aggregateResults(suite.results)
    })),
    git,
    notes: input.notes
  };

  await fs.writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await publishWebResults(input.webResultsDir, runDir, summary, input.suiteResults);
  return { runDir, summary };
}

async function publishWebResults(
  webResultsDir: string,
  runDir: string,
  summary: EvalRunSummary,
  suiteResults: Array<{ suite: EvalSuite; split: string; results: EvalCaseResult[] }>
): Promise<void> {
  await fs.mkdir(webResultsDir, { recursive: true });
  const publicRunDir = path.join(webResultsDir, summary.runId);
  await fs.rm(publicRunDir, { recursive: true, force: true });
  await fs.mkdir(publicRunDir, { recursive: true });
  await fs.copyFile(path.join(runDir, 'summary.json'), path.join(publicRunDir, 'summary.json'));
  for (const suite of suiteResults) {
    const filename = `${suite.suite}-${safeSegment(suite.split)}.json`;
    await fs.writeFile(path.join(publicRunDir, filename), `${JSON.stringify(suite.results, null, 2)}\n`, 'utf8');
  }

  const indexPath = path.join(webResultsDir, 'index.json');
  const existing = await readIndex(indexPath);
  const runs = [summary, ...existing.runs.filter((run) => run.runId !== summary.runId)]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
  await fs.writeFile(indexPath, `${JSON.stringify({ version: 1, latestRunId: runs[0]?.runId ?? summary.runId, runs }, null, 2)}\n`, 'utf8');
}

async function readIndex(indexPath: string): Promise<{ runs: EvalRunSummary[] }> {
  try {
    const parsed = JSON.parse(await fs.readFile(indexPath, 'utf8')) as { runs?: EvalRunSummary[] };
    return { runs: Array.isArray(parsed.runs) ? parsed.runs : [] };
  } catch {
    return { runs: [] };
  }
}

async function gitState(): Promise<EvalRunSummary['git']> {
  const sha = await execFileAsync('git', ['rev-parse', 'HEAD']).then((result) => result.stdout.trim()).catch(() => 'unknown');
  const dirty = await execFileAsync('git', ['status', '--porcelain']).then((result) => Boolean(result.stdout.trim())).catch(() => true);
  return { sha, dirty };
}
