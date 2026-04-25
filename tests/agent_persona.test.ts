import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadPersona,
  composePrompt,
  HYDRATION_FOOTER,
  TASK_EXECUTION_FOOTER
} from '../src/main/agent/persona';
import { buildTaskContext } from '../src/main/agent/context';
import type { TaskRecord, EntitySummary } from '../src/shared/schemas';

describe('agent persona composition', () => {
  it('loads AGENT.md body, strips frontmatter, builds a prompt containing persona + task UIDs', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-persona-'));
    try {
      await fs.writeFile(
        path.join(vault, 'AGENT.md'),
        '---\ntitle: Agent\n---\nYou are Orbit, meticulous and kind.\n',
        'utf8'
      );
      const persona = await loadPersona(vault);
      expect(persona).toContain('meticulous and kind');
      expect(persona).not.toContain('title: Agent');

      const task: TaskRecord = {
        id: 'file:01_Projects/P1.md',
        source: 'file',
        status: 'todo',
        title: 'Ship vessel',
        filePath: '/tmp/fake',
        relPath: '01_Projects/P1.md',
        uid: 'TASKUID00001',
        project_uid: 'PROJUID00001'
      };
      const entities: EntitySummary[] = [
        {
          type: 'project',
          uid: 'PROJUID00001',
          title: 'Orbit M4',
          relPath: '01_Projects/Orbit.md',
          path: '/tmp/fake'
        }
      ];
      const ctx = buildTaskContext({
        task,
        entities,
        taskDocument: {
          blockedReason: 'Need the API contract',
          description: 'Implement the vessel shipping flow.',
          summary: 'No code changes yet.',
          recentExecutionLog: '- [2026-04-25T00:00:00.000Z] Asked for the API schema.'
        }
      });
      const prompt = composePrompt({
        persona,
        taskContext: ctx,
        userAsk: 'Draft a plan.',
        taskBoundary: {
          title: task.title,
          uid: task.uid
        }
      });
      expect(prompt).toContain('# Persona');
      expect(prompt).toContain('meticulous and kind');
      expect(prompt).toContain('Ship vessel');
      expect(prompt).toContain('TASKUID00001');
      expect(prompt).toContain('PROJUID00001');
      expect(prompt).toContain('Orbit M4');
      expect(prompt).toContain('## Description');
      expect(prompt).toContain('Implement the vessel shipping flow.');
      expect(prompt).toContain('blocked_reason: Need the API contract');
      expect(prompt).toContain('# Boundary');
      expect(prompt).toContain('Only do work that is within this task');
      expect(prompt).toContain('If information is missing, pause and ask for clarification');
      expect(prompt).toContain(TASK_EXECUTION_FOOTER);
      expect(prompt).toContain(HYDRATION_FOOTER);
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('falls back to a default persona when AGENT.md is missing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-persona-'));
    try {
      const p = await loadPersona(dir);
      expect(p.length).toBeGreaterThan(0);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
