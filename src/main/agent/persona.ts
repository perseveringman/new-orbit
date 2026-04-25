import path from 'node:path';
import { promises as fs } from 'node:fs';
import * as frontmatter from '../frontmatter';
import { VISION_FILENAME, VISION_SECTION_HEADING } from '../vision';

/**
 * Load the vault's AGENT.md persona (stripped of frontmatter). When a
 * `Vision.md` exists at the vault root, its body is appended as a
 * "North Star" section so every Agent run is aligned with the user's vision.
 * The append is idempotent: if the returned persona already contains the
 * North Star heading, it is not added twice.
 */
export async function loadPersona(vaultPath: string): Promise<string> {
  const p = path.join(vaultPath, 'AGENT.md');
  let base: string;
  try {
    const raw = await fs.readFile(p, 'utf8');
    const { body } = frontmatter.read(raw);
    base = body.trim() || DEFAULT_PERSONA;
  } catch {
    base = DEFAULT_PERSONA;
  }
  const visionBody = await loadVisionBody(vaultPath);
  if (!visionBody) return base;
  if (base.includes(VISION_SECTION_HEADING)) return base;
  return `${base.trimEnd()}\n\n${VISION_SECTION_HEADING}\n\n${visionBody.trim()}\n`;
}

async function loadVisionBody(vaultPath: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(vaultPath, VISION_FILENAME), 'utf8');
    const { body } = frontmatter.read(raw);
    return body.trim();
  } catch {
    return '';
  }
}

const DEFAULT_PERSONA = `You are Orbit, a calm, precise collaborator. You never fabricate facts, never push to remotes without permission, and always surface uncertainty explicitly.`;

export interface ComposeArgs {
  persona: string;
  taskContext: string;
  userAsk: string;
  taskBoundary?: {
    title: string;
    uid?: string;
  };
}

/**
 * Compose the final prompt sent to `claude -p`. Format is stable so tests
 * can assert on its three sections.
 */
export function composePrompt({ persona, taskContext, userAsk, taskBoundary }: ComposeArgs): string {
  const parts = [
    `# Persona\n${persona.trim()}`,
    `# Task context\n${taskContext.trim()}`,
    `# Your ask\n${userAsk.trim() || '(proceed with the task as described above)'}`,
    taskBoundary ? buildTaskBoundary(taskBoundary) : null,
    HYDRATION_FOOTER
  ].filter(Boolean);
  return parts.join('\n\n');
}

export const HYDRATION_FOOTER = `# Context hydration
You may request more context at any time by emitting a single line that starts with \`@orbit:search <query>\`. Orbit will respond with the top search hits from the vault as a follow-up message. Use this sparingly.`;

function buildTaskBoundary(task: { title: string; uid?: string }): string {
  return `# Boundary
You are currently responsible for exactly this task: "${task.title}"${task.uid ? ` (uid: ${task.uid})` : ''}.

- Only do work that is within this task's scope
- If more work is needed, create a new task instead of expanding scope in this run
- Do not change the status of other tasks
- End with a concise completion summary`;
}
