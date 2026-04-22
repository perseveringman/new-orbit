import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { nanoid } from 'nanoid';
import * as frontmatter from '../frontmatter';
import { listProjects, listProjectTaskPaths } from '../project';
import { parseTaskSections } from '../task_sections';
import { readCostRecords, summarize } from '../agent/tokens';
import { updateTaskFrontmatter } from '../task';

export interface DailyReviewResult {
  date: string;
  path: string;
  relPath: string;
  content: string;
  recommendedTaskUids: string[];
  usedLlm: boolean;
}

export interface DailyReviewDeps {
  now?: () => Date;
  /** Test hook — override git log invocation. */
  runGit?: (args: string[], cwd: string) => Promise<string>;
  /**
   * If provided, called with persona + collected context and expected to
   * return Markdown body. Omit for template-only generation.
   */
  runAgent?: (prompt: string, context: string) => Promise<string>;
  /** Override how recommended tasks get flagged. */
  markRecommended?: (uids: string[]) => Promise<void>;
}

interface DailyData {
  date: string; // YYYY-MM-DD (local)
  commits: {
    project: string;
    sha: string;
    shortSha: string;
    subject: string;
    at: string;
  }[];
  newExecLogLines: { project: string; task: string; taskUid: string; line: string }[];
  doneTasks: { project: string; title: string; uid: string }[];
  newTasks: { project: string; title: string; uid: string }[];
  blockedTasks: { project: string; title: string; uid: string }[];
  openTasks: { project: string; title: string; uid: string; status: string }[];
  cost: { usd: number; inTokens: number; outTokens: number; runs: number };
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

async function defaultRunGit(args: string[], cwd: string): Promise<string> {
  return new Promise<string>((resolve) => {
    let buf = '';
    const child = nodeSpawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', (c: Buffer) => {
      buf += c.toString('utf8');
    });
    child.on('error', () => resolve(''));
    child.on('close', () => resolve(buf));
  });
}

/**
 * Collect the raw data that feeds both the template renderer and the
 * LLM prompt. Exported for tests.
 */
export async function collectDailyData(
  vaultPath: string,
  dateInput: Date | string,
  deps: DailyReviewDeps = {}
): Promise<DailyData> {
  const now =
    deps.now?.() ??
    (typeof dateInput === 'string' ? new Date(`${dateInput}T12:00:00`) : dateInput);
  const date = typeof dateInput === 'string' ? dateInput : localDateStr(now);
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const runGit = deps.runGit ?? defaultRunGit;

  const data: DailyData = {
    date,
    commits: [],
    newExecLogLines: [],
    doneTasks: [],
    newTasks: [],
    blockedTasks: [],
    openTasks: [],
    cost: { usd: 0, inTokens: 0, outTokens: 0, runs: 0 }
  };

  const projects = await listProjects(vaultPath);

  for (const p of projects) {
    if (p.legacy) continue;
    const dotGit = path.join(p.path, '.git');
    try {
      await fs.access(dotGit);
    } catch {
      continue;
    }
    const since = dayStart.toISOString();
    const until = dayEnd.toISOString();
    const raw = await runGit(
      [
        'log',
        `--since=${since}`,
        `--until=${until}`,
        '--no-merges',
        '--format=%H%x1f%s%x1f%aI'
      ],
      p.path
    );
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split('\x1f');
      if (parts.length < 3) continue;
      data.commits.push({
        project: p.name,
        sha: parts[0] ?? '',
        shortSha: (parts[0] ?? '').slice(0, 7),
        subject: parts[1] ?? '',
        at: parts[2] ?? ''
      });
    }
  }

  const isoPrefix = (iso: string): string => iso.slice(0, 10);
  for (const p of projects) {
    if (p.legacy) continue;
    const taskPaths = await listProjectTaskPaths(p.path);
    for (const abs of taskPaths) {
      let raw: string;
      try {
        raw = await fs.readFile(abs, 'utf8');
      } catch {
        continue;
      }
      const { data: fm, body } = frontmatter.read(raw);
      const uid = typeof fm['uid'] === 'string' ? (fm['uid'] as string) : '';
      const title =
        (typeof fm['title'] === 'string' && (fm['title'] as string)) ||
        path.basename(abs, '.md');
      const status =
        typeof fm['status'] === 'string' ? (fm['status'] as string) : 'inbox';
      const updatedAt =
        typeof fm['updated_at'] === 'string' ? (fm['updated_at'] as string) : '';
      const createdAt =
        typeof fm['created_at'] === 'string' ? (fm['created_at'] as string) : '';

      if (updatedAt && isoPrefix(updatedAt) === date) {
        if (status === 'done') data.doneTasks.push({ project: p.name, title, uid });
        if (status === 'blocked')
          data.blockedTasks.push({ project: p.name, title, uid });
      }
      if (createdAt && isoPrefix(createdAt) === date) {
        data.newTasks.push({ project: p.name, title, uid });
      }
      if (status !== 'done' && status !== 'blocked') {
        data.openTasks.push({ project: p.name, title, uid, status });
      }

      const sections = parseTaskSections(body);
      if (sections.executionLog.trim()) {
        for (const line of sections.executionLog.split('\n')) {
          const m = line.match(/^\s*-\s*\[([^\]]+)\]\s+(.*)$/);
          if (!m) continue;
          const iso = m[1] ?? '';
          if (iso.slice(0, 10) !== date) continue;
          data.newExecLogLines.push({
            project: p.name,
            task: title,
            taskUid: uid,
            line: (m[2] ?? '').trim()
          });
        }
      }
    }
  }

  try {
    const records = await readCostRecords(vaultPath, now);
    const today = records.filter((r) => isoPrefix(r.at) === date);
    const sum = summarize(today);
    data.cost = {
      usd: sum.estUSD,
      inTokens: sum.tokens.in,
      outTokens: sum.tokens.out,
      runs: sum.runs
    };
  } catch {
    /* cost is optional */
  }

  return data;
}

function renderTemplate(d: DailyData): { content: string; recommended: string[] } {
  const lines: string[] = [];
  const recommended: { title: string; uid: string; project: string; reason: string }[] =
    [];

  const byStatus = new Map<string, typeof d.openTasks>();
  for (const t of d.openTasks) {
    const arr = byStatus.get(t.status) ?? [];
    arr.push(t);
    byStatus.set(t.status, arr);
  }
  const prio = ['today', 'doing', 'inbox'];
  outer: for (const s of prio) {
    for (const t of byStatus.get(s) ?? []) {
      if (!t.uid) continue;
      recommended.push({
        title: t.title,
        uid: t.uid,
        project: t.project,
        reason: `continues from ${s}`
      });
      if (recommended.length >= 5) break outer;
    }
  }

  lines.push(`---`);
  lines.push(`uid: ${nanoid(12)}`);
  lines.push(`type: journal`);
  lines.push(`date: ${d.date}`);
  lines.push(`---`);
  lines.push(`# Daily Review ${d.date}`);
  lines.push('');
  lines.push('## 今日做了什么');
  if (
    d.commits.length === 0 &&
    d.newExecLogLines.length === 0 &&
    d.doneTasks.length === 0
  ) {
    lines.push('- (空白日)');
  } else {
    if (d.doneTasks.length) {
      lines.push('### 完成任务');
      for (const t of d.doneTasks) lines.push(`- ✅ ${t.project} — ${t.title}`);
    }
    if (d.commits.length) {
      lines.push('### 提交');
      for (const c of d.commits)
        lines.push(`- \`${c.shortSha}\` ${c.project}: ${c.subject}`);
    }
    if (d.newExecLogLines.length) {
      lines.push('### Execution Log 摘要');
      for (const e of d.newExecLogLines.slice(0, 20)) {
        lines.push(`- ${e.project} / ${e.task}: ${e.line}`);
      }
    }
  }
  lines.push('');
  lines.push('## 收获 / 阻塞');
  if (d.blockedTasks.length === 0) lines.push('- 无阻塞记录');
  else
    for (const t of d.blockedTasks)
      lines.push(`- ⚠️ ${t.project} — ${t.title} (uid: ${t.uid})`);
  lines.push('');
  lines.push('## 明日建议');
  if (recommended.length === 0) {
    lines.push('- (无推荐任务 — 收件箱已清空或今日首次启动)');
  } else {
    for (const r of recommended) {
      lines.push(`- [ ] ${r.title} — ${r.reason} (uid: ${r.uid})`);
    }
  }
  lines.push('');
  lines.push('## 元数据');
  lines.push(
    `commits: ${d.commits.length}, tasks done: ${d.doneTasks.length}, blocked: ${d.blockedTasks.length}, cost: $${d.cost.usd.toFixed(4)}`
  );
  lines.push('');

  return { content: lines.join('\n'), recommended: recommended.map((r) => r.uid) };
}

function buildContextBlock(d: DailyData): string {
  const ctx: string[] = [];
  ctx.push(`Date: ${d.date}`);
  ctx.push(`Cost today: $${d.cost.usd.toFixed(4)} (${d.cost.runs} runs)`);
  ctx.push('');
  ctx.push(`Commits (${d.commits.length}):`);
  for (const c of d.commits)
    ctx.push(`  ${c.shortSha} [${c.project}] ${c.subject}`);
  ctx.push('');
  ctx.push(`Tasks done (${d.doneTasks.length}):`);
  for (const t of d.doneTasks)
    ctx.push(`  - ${t.project}: ${t.title} (uid: ${t.uid})`);
  ctx.push('');
  ctx.push(`Tasks blocked (${d.blockedTasks.length}):`);
  for (const t of d.blockedTasks)
    ctx.push(`  - ${t.project}: ${t.title} (uid: ${t.uid})`);
  ctx.push('');
  ctx.push(`Open tasks (${d.openTasks.length}, for recommendation):`);
  for (const t of d.openTasks.slice(0, 30)) {
    ctx.push(`  - [${t.status}] ${t.project}: ${t.title} (uid: ${t.uid})`);
  }
  ctx.push('');
  ctx.push(`Execution log lines today:`);
  for (const e of d.newExecLogLines.slice(0, 30)) {
    ctx.push(`  - ${e.project}/${e.task}: ${e.line}`);
  }
  return ctx.join('\n');
}

export const REVIEW_PERSONA = `You are Orbit's Daily Review Analyst. You summarise the user's work day as structured Markdown using exactly these sections:

# Daily Review <date>
## 今日做了什么
## 收获 / 阻塞
## 明日建议
## 元数据

Rules:
- In "明日建议", emit 3–5 items formatted as:  "- [ ] <title> — <reason> (uid: <uid>)".
- Only recommend uids that appear in the supplied Open tasks list.
- Keep prose terse, factual, no fluff.
- Do not invent commits, tasks, or uids.`;

function extractUidsFromMarkdown(md: string): string[] {
  const uids: string[] = [];
  const suggestionSection = md.split(/##\s+明日建议/)[1] ?? '';
  const cut = suggestionSection.split(/\n##\s+/)[0] ?? suggestionSection;
  const re = /\(uid:\s*([A-Za-z0-9_-]+)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cut)) !== null) {
    const u = m[1];
    if (u && !uids.includes(u)) uids.push(u);
  }
  return uids;
}

export async function generateDailyReview(
  vaultPath: string,
  dateInput?: Date | string,
  deps: DailyReviewDeps = {}
): Promise<DailyReviewResult> {
  const now = deps.now?.() ?? new Date();
  const date = typeof dateInput === 'string' ? dateInput : localDateStr(now);

  const data = await collectDailyData(vaultPath, date, deps);
  const template = renderTemplate(data);

  let content = template.content;
  let recommended = template.recommended;
  let usedLlm = false;

  if (deps.runAgent) {
    try {
      const ctx = buildContextBlock(data);
      const llmBody = await deps.runAgent(REVIEW_PERSONA, ctx);
      if (llmBody && llmBody.trim()) {
        const fm = [
          '---',
          `uid: ${nanoid(12)}`,
          'type: journal',
          `date: ${date}`,
          '---'
        ].join('\n');
        content = `${fm}\n${llmBody.trim()}\n`;
        const uids = extractUidsFromMarkdown(llmBody);
        const openUids = new Set(data.openTasks.map((t) => t.uid));
        recommended = uids.filter((u) => openUids.has(u));
        usedLlm = true;
      }
    } catch {
      /* fall through to template */
    }
  }

  const relPath = `02_Areas/Journal/${date}.md`;
  const abs = path.join(vaultPath, '02_Areas', 'Journal', `${date}.md`);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf8');

  if (recommended.length) {
    const mark =
      deps.markRecommended ??
      (async (uids: string[]): Promise<void> => {
        const projects = await listProjects(vaultPath);
        const map = new Map<string, string>();
        for (const p of projects) {
          if (p.legacy) continue;
          const paths = await listProjectTaskPaths(p.path);
          for (const ap of paths) {
            try {
              const raw = await fs.readFile(ap, 'utf8');
              const { data: fm } = frontmatter.read(raw);
              const u = typeof fm['uid'] === 'string' ? (fm['uid'] as string) : '';
              if (u) map.set(u, ap);
            } catch {
              /* ignore */
            }
          }
        }
        for (const u of uids) {
          const p = map.get(u);
          if (!p) continue;
          await updateTaskFrontmatter(p, {
            recommended: true,
            status: 'today',
            updated_at: new Date().toISOString()
          } as Record<string, unknown>);
        }
      });
    await mark(recommended);
  }

  return { date, path: abs, relPath, content, recommendedTaskUids: recommended, usedLlm };
}

export async function readJournal(
  vaultPath: string,
  date: string
): Promise<DailyReviewResult | null> {
  const abs = path.join(vaultPath, '02_Areas', 'Journal', `${date}.md`);
  try {
    const content = await fs.readFile(abs, 'utf8');
    return {
      date,
      path: abs,
      relPath: `02_Areas/Journal/${date}.md`,
      content,
      recommendedTaskUids: extractUidsFromMarkdown(content),
      usedLlm: false
    };
  } catch {
    return null;
  }
}

export async function listJournals(
  vaultPath: string
): Promise<{ date: string; path: string; relPath: string; excerpt: string }[]> {
  const dir = path.join(vaultPath, '02_Areas', 'Journal');
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: { date: string; path: string; relPath: string; excerpt: string }[] = [];
  for (const e of entries) {
    if (!e.endsWith('.md')) continue;
    const date = e.slice(0, -3);
    const abs = path.join(dir, e);
    try {
      const raw = await fs.readFile(abs, 'utf8');
      const { body } = frontmatter.read(raw);
      const excerpt = body
        .split('\n')
        .filter((l) => l.trim() && !l.startsWith('#'))
        .slice(0, 2)
        .join(' ')
        .slice(0, 160);
      out.push({ date, path: abs, relPath: `02_Areas/Journal/${e}`, excerpt });
    } catch {
      /* skip */
    }
  }
  out.sort((a, b) => (a.date < b.date ? 1 : -1));
  return out;
}
