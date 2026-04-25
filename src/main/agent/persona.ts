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
    TASK_EXECUTION_FOOTER,
    ORBIT_RUNTIME_FOOTER
  ].filter(Boolean);
  return parts.join('\n\n');
}

export const TASK_EXECUTION_FOOTER = `# Task execution contract
Before writing code or changing files, inspect the current project context and judge whether the task information is sufficient.

- Read the relevant local context first (task file, nearby code, README, AGENT, and Orbit CLI project context when helpful)
- If requirements are ambiguous or information is missing, ask concise clarification questions instead of pretending the task is finished
- Record your internal substeps (thinking, coding, testing, debugging) in the current task Execution Log; do not create Kanban tasks for them
- If you discover independent work that should be tracked on the Kanban, use \`orbit task propose\` for user approval; do not create tasks directly
- If you need to expand this task's scope, use \`orbit task propose-scope\` for approval
- When you need user input, keep the task in a non-done state and use \`orbit inbox help\`
- When you start real implementation work, move the task to \`doing\` through Orbit CLI
- Only mark the task \`done\` after the requested outcome is truly complete
- When the result is ready for review, use \`orbit run request-merge\`
- A clean process exit does not mean the task is done; if you asked questions or are waiting on clarification, leave the task open`;

export const ORBIT_RUNTIME_FOOTER = `# Orbit runtime
Prefer the \`orbit\` CLI and local project context when they are available in the working directory. Do not invent custom stdout protocols to ask for more context.`;
export const HYDRATION_FOOTER = ORBIT_RUNTIME_FOOTER;

function buildTaskBoundary(task: { title: string; uid?: string }): string {
  return `# Boundary
You are currently responsible for exactly this task: "${task.title}"${task.uid ? ` (uid: ${task.uid})` : ''}.

- Only do work that is within this task's scope
- If more work is needed, propose it with \`orbit task propose\` instead of creating a task directly or expanding scope in this run
- Do not change the status of other tasks
- If information is missing, pause and ask for clarification before implementation
- End with a concise completion summary`;
}
