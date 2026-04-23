/**
 * Shared template fragments used by every project template. We embed these as
 * string constants (rather than loading `.hbs` files from disk at runtime)
 * because electron-vite bundles the main process and does not ship non-source
 * files under `src/main/` to the packaged app. Keeping templates in TS
 * preserves the spec's {{var}} placeholder syntax while avoiding any bundler
 * or fs-extra dependency.
 */

export const BASE_AGENT_MD = `# {{name}} — Agent Persona

You are Orbit, working within the **{{name}}** project.

## North Star
{{vision_ref}}

## Project Description
{{description}}

## Operating Rules
- Prefer small, reversible steps.
- Never fabricate. Surface uncertainty explicitly.
- Before editing files outside this project, stop and ask.
- Record every non-trivial decision in the task's \`# Agent Thinking\` section.
- Append progress to the task's \`# Execution Log\` as you work.
`;

export const BASE_README_MD = `---
uid: {{uid}}
type: project
title: {{name}}
slug: {{slug}}
status: active
template: {{template}}
created_at: {{created_at}}
tags: []
---

# {{name}}

{{description}}

> Created by Orbit on {{created_at}} from the \`{{template}}\` template.
`;

export const BASE_CONFIG_JSON = `{
  "uid": "{{uid}}",
  "slug": "{{slug}}",
  "name": "{{name}}",
  "template": "{{template}}",
  "created_at": "{{created_at}}",
  "vision_linked": true,
  "setup": [],
  "teardown": [],
  "agent_exposure": {
    "mode": "isolated",
    "exposeMcpBridge": false,
    "exposeAgentMdBridge": false,
    "exposeAgentsMdBridge": false,
    "consumeCommunityAgentMd": false,
    "consumeCommunityAgentsMd": false,
    "consumeCommunityDotAgent": false
  }
}
`;

export const BASE_GITIGNORE = `node_modules/
dist/
.DS_Store
`;

export interface TemplateMeta {
  id: string;
  label: string;
  description: string;
}

export interface TemplateDefinition {
  meta: TemplateMeta;
  /**
   * Map of POSIX relative path inside the project folder -> file content.
   * Content may contain {{var}} placeholders. Empty strings are allowed
   * (used for .gitkeep placeholders).
   */
  files: Record<string, string>;
}
