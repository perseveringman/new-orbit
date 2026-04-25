import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createThoughtService } from '../src/main/capture';
import type { ActivityEventInput } from '../src/main/activity';
import type { ThoughtPayload } from '../src/shared/inbox';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = path.join(process.cwd(), 'test-results', 'thought-lifecycle', randomUUID());
  await fs.mkdir(vaultPath, { recursive: true });
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('thought lifecycle', () => {
  it('creates, updates, promotes and dismisses thoughts while preserving actor information', async () => {
    const activities: ActivityEventInput[] = [];
    const service = createThoughtService(vaultPath, {
      now: () => new Date('2026-04-26T10:00:00.000Z'),
      emitActivity: (event) => activities.push(event)
    });

    const thought = await service.create({ content: 'An agent-captured idea', tags: ['idea'], createdFrom: 'agent', actor: 'agent', actorId: 'run_1' });
    const updated = await service.update(thought.id, { content: 'An updated idea', tags: ['idea', 'orbit'] });
    const projectReadme = path.join(vaultPath, '01_Projects', 'demo', 'README.md');
    await service.link(thought.id, { projectUid: 'proj_demo', projectReadmePath: projectReadme });
    const promoted = await service.promote(thought.id);
    const dismissed = await service.create({ content: 'Dismiss me', createdFrom: 'manual' });
    await service.dismiss(dismissed.id);
    const readme = await fs.readFile(projectReadme, 'utf8');

    expect((thought.payload as ThoughtPayload).created_from).toBe('agent');
    expect(thought.context.actor_id).toBe('run_1');
    expect((updated.payload as ThoughtPayload).tags).toEqual(['idea', 'orbit']);
    expect(readme).toContain('An updated idea');
    expect(promoted.item.status).toBe('processed');
    expect(activities.map((event) => event.action)).toEqual(['thought.created', 'thought.promoted', 'thought.created', 'thought.dismissed']);
    expect(activities[0]!.actor).toBe('agent');
    expect(activities[0]!.actor_id).toBe('run_1');
  });
});
