import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../src/main/vault';
import { createProject } from '../src/main/project';
import { generateDailyReview, readJournal } from '../src/main/review/daily';
import * as frontmatter from '../src/main/frontmatter';

async function tmpVault(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-review-'));
  await createVault(d);
  return d;
}

async function writeTask(
  vault: string,
  projectSlug: string,
  opts: {
    uid: string;
    title: string;
    status: string;
    updatedToday?: string;
    createdToday?: string;
    execLogDate?: string;
  }
): Promise<string> {
  const taskDir = path.join(vault, '01_Projects', projectSlug, '.agent', 'tasks');
  await fs.mkdir(taskDir, { recursive: true });
  const abs = path.join(taskDir, `${opts.uid}.md`);
  const updated = opts.updatedToday ? `updated_at: ${opts.updatedToday}T12:00:00Z\n` : '';
  const created = opts.createdToday ? `created_at: ${opts.createdToday}T09:00:00Z\n` : '';
  const execLog = opts.execLogDate
    ? `\n## Execution Log\n- [${opts.execLogDate}T10:00:00Z] did something\n`
    : '';
  const content = `---
uid: ${opts.uid}
type: task
title: ${opts.title}
status: ${opts.status}
${created}${updated}---

## Description
Body.

## Thinking

## Execution Log${execLog}

## Summary
`;
  await fs.writeFile(abs, content, 'utf8');
  return abs;
}

describe('review.generateDailyReview (R6)', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('produces a markdown journal with commits, tasks, and recommendations (template path)', async () => {
    await createProject(vault, { slug: 'alpha', template: 'blank', name: 'Alpha' });
    await createProject(vault, { slug: 'beta', template: 'blank', name: 'Beta' });

    const today = '2030-06-15';
    await writeTask(vault, 'alpha', {
      uid: 'taskalpha001',
      title: 'Ship alpha feature',
      status: 'done',
      updatedToday: today,
      execLogDate: today
    });
    await writeTask(vault, 'beta', {
      uid: 'taskbeta0001',
      title: 'Design beta API',
      status: 'today'
    });
    await writeTask(vault, 'alpha', {
      uid: 'taskalpha002',
      title: 'Inbox item',
      status: 'inbox'
    });

    const stubGit = async (args: string[], cwd: string): Promise<string> => {
      if (cwd.endsWith('alpha')) {
        return 'abcdef1234567890\x1ffeat: ship thing\x1f2030-06-15T10:12:00Z\n';
      }
      if (cwd.endsWith('beta')) {
        return 'fedcba0987654321\x1fchore: update deps\x1f2030-06-15T11:00:00Z\n';
      }
      return '';
    };

    const res = await generateDailyReview(vault, today, { runGit: stubGit });

    expect(res.date).toBe(today);
    expect(res.usedLlm).toBe(false);
    expect(res.content).toContain('# Daily Review 2030-06-15');
    expect(res.content).toContain('abcdef1'); // short sha in commits
    expect(res.content).toContain('fedcba0');
    expect(res.content).toContain('Ship alpha feature');
    expect(res.content).toContain('## 明日建议');
    // Recommendations should be among open tasks (today + inbox).
    expect(res.recommendedTaskUids.length).toBeGreaterThan(0);
    expect(res.recommendedTaskUids).toContain('taskbeta0001');
    // frontmatter on journal file
    expect(res.content).toMatch(/^---\nuid:/);
    // file written
    const abs = path.join(vault, '02_Areas', 'Journal', `${today}.md`);
    const written = await fs.readFile(abs, 'utf8');
    expect(written).toBe(res.content);

    // recommended uids get `recommended: true` frontmatter
    const betaTask = path.join(
      vault,
      '01_Projects',
      'beta',
      '.agent',
      'tasks',
      'taskbeta0001.md'
    );
    const raw = await fs.readFile(betaTask, 'utf8');
    const { data } = frontmatter.read(raw);
    expect(data['recommended']).toBe(true);
    expect(data['status']).toBe('today');
  });

  it('template path works without any API key (LLM fallback)', async () => {
    await createProject(vault, { slug: 'gamma', template: 'blank', name: 'Gamma' });
    const today = '2030-06-16';
    await writeTask(vault, 'gamma', {
      uid: 'taskgamma001',
      title: 'Gamma task',
      status: 'inbox'
    });
    const res = await generateDailyReview(vault, today, {
      runGit: async () => ''
    });
    expect(res.usedLlm).toBe(false);
    expect(res.content).toContain('# Daily Review 2030-06-16');
    const journal = await readJournal(vault, today);
    expect(journal).not.toBeNull();
    expect(journal?.content).toBe(res.content);
  });

  it('uses injected runAgent when provided and extracts uids from its output', async () => {
    await createProject(vault, { slug: 'delta', template: 'blank', name: 'Delta' });
    const today = '2030-06-17';
    await writeTask(vault, 'delta', {
      uid: 'taskdelta001',
      title: 'Delta one',
      status: 'inbox'
    });
    const fakeLlm = `# Daily Review ${today}
## 今日做了什么
- LLM summary
## 收获 / 阻塞
- none
## 明日建议
- [ ] Delta one — highest leverage (uid: taskdelta001)
## 元数据
commits: 0
`;
    const res = await generateDailyReview(vault, today, {
      runGit: async () => '',
      runAgent: async () => fakeLlm
    });
    expect(res.usedLlm).toBe(true);
    expect(res.recommendedTaskUids).toEqual(['taskdelta001']);
    expect(res.content).toContain('LLM summary');
  });
});
