import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readTaskFile,
  updateTaskFrontmatter,
  updateTaskSection,
  appendExecutionLog
} from '../src/main/task';
import { contentHash } from '../src/main/content_hash';
import * as frontmatter from '../src/main/frontmatter';

/**
 * These tests pin down the main-side task mutation helpers used by the R3
 * IPC handlers. They exercise the helpers directly (without ipcMain) to
 * keep the test fast and avoid bootstrapping a full vault session. The
 * refmap refresh is stubbed via the `onWritten` callback.
 */

async function tmpTaskFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-task-rw-'));
  const abs = path.join(dir, 'task.md');
  const initial =
    [
      '---',
      'uid: t-1',
      'type: task',
      'title: hello',
      'status: inbox',
      'tags:',
      '  - a',
      '---',
      '# Description',
      'original description',
      '',
      '# Agent Thinking',
      'thinking',
      '',
      '# Execution Log',
      '- [2025-01-01T00:00:00Z] seeded',
      '',
      '# Summary',
      'wip',
      ''
    ].join('\n');
  await fs.writeFile(abs, initial, 'utf8');
  return abs;
}

describe('task.* main helpers (R3)', () => {
  let abs: string;
  beforeEach(async () => {
    abs = await tmpTaskFile();
  });
  afterEach(async () => {
    await fs.rm(path.dirname(abs), { recursive: true, force: true });
  });

  it('readTaskFile returns frontmatter + sections + raw', async () => {
    const v = await readTaskFile(abs);
    expect(v.frontmatter['uid']).toBe('t-1');
    expect(v.frontmatter['status']).toBe('inbox');
    expect(v.sections.description).toBe('original description');
    expect(v.sections.thinking).toBe('thinking');
    expect(v.sections.executionLog).toContain('seeded');
    expect(v.sections.summary).toBe('wip');
    expect(v.raw).toContain('uid: t-1');
  });

  it('updateTaskFrontmatter patches frontmatter without touching the body', async () => {
    const before = await fs.readFile(abs, 'utf8');
    const beforeBody = frontmatter.read(before).body;

    let seen: string | null = null;
    await updateTaskFrontmatter(
      abs,
      { status: 'doing', priority: 'high' },
      (next) => {
        seen = next;
      }
    );
    expect(seen).not.toBeNull();

    const after = await fs.readFile(abs, 'utf8');
    const { data, body } = frontmatter.read(after);
    expect(data['status']).toBe('doing');
    expect(data['priority']).toBe('high');
    // Body bytes preserved exactly.
    expect(body).toBe(beforeBody);
  });

  it('updateTaskSection rewrites only the named section', async () => {
    await updateTaskSection(abs, 'description', 'brand new desc');
    const v = await readTaskFile(abs);
    expect(v.sections.description).toBe('brand new desc');
    expect(v.sections.thinking).toBe('thinking');
    expect(v.sections.executionLog).toContain('seeded');
    expect(v.sections.summary).toBe('wip');
    // Frontmatter untouched.
    expect(v.frontmatter['uid']).toBe('t-1');
    expect(v.frontmatter['status']).toBe('inbox');
  });

  it('appendExecutionLog appends a dated line to # Execution Log', async () => {
    await appendExecutionLog(abs, 'did a thing', '2025-06-15T10:00:00.000Z');
    const v = await readTaskFile(abs);
    const log = v.sections.executionLog.split('\n');
    expect(log[log.length - 1]).toBe('- [2025-06-15T10:00:00.000Z] did a thing');
    // Prior line preserved.
    expect(v.sections.executionLog).toContain('seeded');
  });

  it('appendExecutionLog materializes the section when missing', async () => {
    // Remove the section first.
    await updateTaskSection(abs, 'executionLog', '');
    await appendExecutionLog(abs, 'first entry', '2025-06-15T11:00:00.000Z');
    const v = await readTaskFile(abs);
    expect(v.sections.executionLog).toBe('- [2025-06-15T11:00:00.000Z] first entry');
  });

  it('onWritten callback receives the fresh file contents and a matching hash', async () => {
    let captured: string | null = null;
    await updateTaskSection(abs, 'summary', 'new summary text', (next) => {
      captured = next;
    });
    expect(captured).not.toBeNull();
    const disk = await fs.readFile(abs, 'utf8');
    expect(captured).toBe(disk);

    // The refmap caller hashes the *body* (frontmatter stripped). Make sure
    // that hash is stable and recomputable from what we wrote.
    const { body } = frontmatter.read(disk);
    const h = contentHash(body);
    expect(h).toMatch(/^[a-f0-9]{40}$/);
  });

  it('no-op writes short-circuit (no callback fire) when content is unchanged', async () => {
    let fired = 0;
    await updateTaskSection(abs, 'description', 'original description', () => {
      fired += 1;
    });
    expect(fired).toBe(0);
  });
});
