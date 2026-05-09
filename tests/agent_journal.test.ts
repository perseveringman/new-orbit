import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AgentJournal } from '../src/main/agent-tools/journal';

describe('AgentJournal', () => {
  let vault: string;

  beforeEach(async () => {
    vault = await mkdtemp(path.join(os.tmpdir(), 'orbit-agent-journal-'));
  });
  afterEach(async () => {
    await rm(vault, { recursive: true, force: true });
  });

  it('appends NDJSON entries to .orbit/agent-journal/<runId>.ndjson', async () => {
    const journal = new AgentJournal({ vaultPath: vault });
    await journal.record({
      runId: 'sdk-agent-abc',
      conversationId: 'conv-1',
      toolName: 'orbit_resource_create',
      toolUseId: 'toolu_1',
      input: { title: 'My Resource' },
      at: '2026-05-09T00:00:00Z',
      destructive: true
    });
    await journal.record({
      runId: 'sdk-agent-abc',
      toolName: 'orbit_task_update',
      toolUseId: 'toolu_2',
      input: { uid: 'task-1', status: 'done' },
      at: '2026-05-09T00:00:01Z',
      destructive: true
    });

    const file = path.join(vault, '.orbit', 'agent-journal', 'sdk-agent-abc.ndjson');
    const raw = await readFile(file, 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      runId: 'sdk-agent-abc',
      toolName: 'orbit_resource_create',
      input: { title: 'My Resource' }
    });
    expect(JSON.parse(lines[1]!).toolName).toBe('orbit_task_update');
  });

  it('sanitises runId for filesystem safety', async () => {
    const journal = new AgentJournal({ vaultPath: vault });
    await journal.record({
      runId: 'sdk-agent-/../etc',
      toolName: 'orbit_x',
      toolUseId: 't',
      input: {},
      at: '2026-05-09T00:00:00Z',
      destructive: true
    });
    // 不能写到 vault 外（比如 /etc/...），所有不安全字符替换为 _
    const dir = path.join(vault, '.orbit', 'agent-journal');
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    const fname = files[0]!;
    expect(fname.endsWith('.ndjson')).toBe(true);
    expect(fname).not.toContain('/');
    expect(fname).not.toMatch(/\.\./);
    const raw = await readFile(path.join(dir, fname), 'utf8');
    expect(raw).toContain('orbit_x');
  });

  it('is a noop when vaultPath is null', async () => {
    const journal = new AgentJournal({ vaultPath: null });
    await expect(
      journal.record({
        runId: 'r',
        toolName: 't',
        toolUseId: 'u',
        input: {},
        at: '',
        destructive: true
      })
    ).resolves.toBeUndefined();
  });
});
