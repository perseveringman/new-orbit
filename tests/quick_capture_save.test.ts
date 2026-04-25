import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createThoughtService, isQuickCaptureAccelerator, QUICK_CAPTURE_ACCELERATOR } from '../src/main/capture';
import type { ActivityEventInput } from '../src/main/activity';
import type { ThoughtPayload } from '../src/shared/inbox';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = path.join(process.cwd(), 'test-results', 'quick-capture', randomUUID());
  await fs.mkdir(vaultPath, { recursive: true });
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('quick capture save', () => {
  it('uses CmdOrCtrl+Shift+I and saves Thought-only captures into Inbox', async () => {
    const activities: ActivityEventInput[] = [];
    const service = createThoughtService(vaultPath, {
      now: () => new Date('2026-04-26T10:00:00.000Z'),
      emitActivity: (event) => activities.push(event)
    });

    const thought = await service.create({ content: 'Quick captured thought', tags: ['capture'], createdFrom: 'quick_capture', actor: 'user' });
    const stored = await service.get(thought.id);

    expect(QUICK_CAPTURE_ACCELERATOR).toBe('CmdOrCtrl+Shift+I');
    expect(isQuickCaptureAccelerator('CmdOrCtrl+Shift+I')).toBe(true);
    expect(stored?.status).toBe('pending');
    expect((stored?.payload as ThoughtPayload).created_from).toBe('quick_capture');
    expect(activities.map((event) => event.action)).toEqual(['thought.created']);
  });
});
