import { promises as fs } from 'node:fs';
import path from 'node:path';
import blank from './blank';
import webApp from './web-app';
import research from './research';
import writing from './writing';
import type { TemplateDefinition, TemplateMeta } from './common';

export type { TemplateDefinition, TemplateMeta } from './common';

const REGISTRY: Record<string, TemplateDefinition> = {
  blank: blank,
  'web-app': webApp,
  research: research,
  writing: writing
};

export function listTemplates(): TemplateMeta[] {
  return Object.values(REGISTRY).map((t) => ({ ...t.meta }));
}

export function getTemplate(id: string): TemplateDefinition | null {
  return REGISTRY[id] ?? null;
}

/**
 * Replace every occurrence of `{{key}}` in `content` with the value in `vars`.
 * Unknown keys are left intact so tests can easily spot template errors.
 * Intentionally implemented without Handlebars to avoid a runtime dependency.
 */
export function renderTemplate(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : match
  );
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Materialize a template into `targetDir`. Creates nested directories as
 * needed, renders each file through {@link renderTemplate}. Rejects if
 * `targetDir` already exists.
 */
export async function scaffoldProject(
  targetDir: string,
  templateId: string,
  vars: Record<string, string>
): Promise<{ files: string[] }> {
  const tpl = getTemplate(templateId);
  if (!tpl) throw new Error(`unknown template: ${templateId}`);
  if (await exists(targetDir)) {
    throw new Error(`target already exists: ${targetDir}`);
  }
  await fs.mkdir(targetDir, { recursive: true });
  const written: string[] = [];
  for (const [rel, raw] of Object.entries(tpl.files)) {
    const abs = path.join(targetDir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const content = raw ? renderTemplate(raw, vars) : raw;
    await fs.writeFile(abs, content, 'utf8');
    written.push(rel);
  }
  return { files: written };
}

/**
 * Build the four-section task markdown body using uid/title placeholders.
 * R3 will replace this with richer templating; R1 only needs the skeletal
 * four H1 headings so the AgentRunner and hooks have consistent anchors.
 */
export function renderTaskMarkdown(vars: {
  uid: string;
  title: string;
  project_uid: string;
  created_at: string;
  description?: string;
}): string {
  const fm = [
    '---',
    `uid: ${vars.uid}`,
    'type: task',
    `title: ${JSON.stringify(vars.title)}`,
    'status: inbox',
    `project_uid: ${vars.project_uid}`,
    `created_at: ${vars.created_at}`,
    '---',
    ''
  ].join('\n');
  const desc = vars.description?.trim() ?? '';
  return (
    fm +
    '# Description\n' +
    (desc ? desc + '\n' : '') +
    '\n' +
    '# Agent Thinking\n\n' +
    '# Execution Log\n\n' +
    '# Summary\n'
  );
}
