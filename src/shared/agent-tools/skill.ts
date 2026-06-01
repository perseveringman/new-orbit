/**
 * Skill 共享契约（Phase C）。
 *
 * Skill 是 markdown frontmatter 文档，告诉 agent 在特定 scope 下做什么。
 * 文件位置（按合并优先级，后者覆盖前者同名 skill）：
 *   1. ~/.orbit/skills/<name>.md       — 应用级
 *   2. <vault>/.orbit/skills/<name>.md — vault 级
 *   3. <space>/.orbit/skills/<name>.md — space 级（仅当 scope.kind 是 project/area/resource）
 *
 * frontmatter（全部可选；缺失 name 则用文件名）：
 *   name: thought-capture
 *   description: Quick capture flows for inboxes.
 *   scopes: [global, project, area]    # 仅这些 scope 生效；缺省=全 scope
 *   tools: [orbit_resource_create]     # 显式声明依赖的工具子集
 *   params:
 *     - name: topic
 *       description: 灵感主题
 *       required: true
 *   requires:
 *     files: ['00_Inbox/']             # vault 内相对路径必须存在
 *     config: ['app.features.thoughts.enabled']  # 仅做 detection，不解析含义
 *   model: claude-sonnet-4             # 可选，覆盖 endpoint 默认 model
 *
 * Phase C：install 字段彻底忽略（plans/swift-vortex-darwin.md §B5）。
 */

import type { ConversationScope } from '@shared/conversation';

export interface SkillParam {
  name: string;
  description?: string;
  required?: boolean;
}

export interface SkillRequires {
  files?: string[];
  config?: string[];
  /** Secret/env variable names required by the skill runtime, e.g. GETNOTE_API_KEY. */
  env?: string[];
}

export interface SkillFrontmatter {
  /** Skill 唯一名（kebab-case 推荐）。 */
  name: string;
  description?: string;
  /** 仅在这些 ConversationScope.kind 下激活；缺省=全 scope。 */
  scopes?: ConversationScope['kind'][];
  /** Skill 显式依赖的 tool 子集；缺省=不限制，使用 registry 全集。 */
  tools?: string[];
  params?: SkillParam[];
  requires?: SkillRequires;
  /** 可选模型覆盖（Phase D 起被 router 消费；Phase C 仅持久存储）。 */
  model?: string;
}

export type SkillSource = 'app' | 'vault' | 'space';
export type EditableSkillSource = 'app' | 'vault';

export interface SkillRuntimeConfigInput {
  enabled?: boolean;
  /** Optional primary API key, used by gateway tools as a fallback for *_API_KEY env names. */
  apiKey?: string;
  clearApiKey?: boolean;
  /** Env values are stored outside SKILL.md and are never returned to the renderer. */
  env?: Record<string, string>;
  clearEnv?: string[];
  config?: Record<string, unknown>;
}

export interface SkillRuntimeStatus {
  enabled: boolean;
  apiKeySet: boolean;
  requiredEnv: string[];
  configuredEnv: string[];
  missingEnv: string[];
  configKeys: string[];
}

export interface SkillDiagnostics {
  missingReferences: string[];
}

/** SkillLoader 加载后的 skill。 */
export interface LoadedSkill {
  name: string;
  description: string;
  scopes: ConversationScope['kind'][];
  /** 显式声明的 tool 子集；空数组 = 不限制（用 registry 全集）。 */
  tools: string[];
  params: SkillParam[];
  requires: SkillRequires;
  /** Skill markdown body（已剥离 frontmatter，trim 过）。 */
  body: string;
  /** 加载来源。 */
  source: SkillSource;
  /** 绝对文件路径（debug 用）。 */
  path: string;
  /** 模型覆盖。 */
  model?: string;
  /** Runtime config status only; secret values are intentionally omitted. */
  runtimeStatus: SkillRuntimeStatus;
  diagnostics: SkillDiagnostics;
  /**
   * requires 检测后的状态：
   *   - undefined：通过，skill 激活
   *   - 字符串：失败原因，skill 不会被注入到本次 send（UI 可显示 disabled）
   */
  disabledReason?: string;
}

export interface AgentSkillView extends LoadedSkill {
  /** 当前名称在合并优先级后是否真正生效。 */
  effective: boolean;
  /** 当前 UI 是否允许直接编辑这个来源。 */
  editable: boolean;
}

export interface AgentSkillRegistrySnapshot {
  generatedAt: number;
  skills: AgentSkillView[];
  sources: {
    appDir: string;
    vaultDir?: string;
  };
}

export interface AgentSkillSaveInput {
  source: EditableSkillSource;
  /** 重命名时用于删除旧文件；缺省表示新增或覆盖同名 skill。 */
  originalName?: string;
  name: string;
  description?: string;
  scopes?: ConversationScope['kind'][];
  tools?: string[];
  params?: SkillParam[];
  requires?: SkillRequires;
  model?: string;
  runtimeConfig?: SkillRuntimeConfigInput;
  body: string;
}

export interface AgentSkillDeleteInput {
  source: EditableSkillSource;
  name: string;
}

export interface AgentSkillConfigUpdateInput {
  source: EditableSkillSource;
  name: string;
  runtimeConfig: SkillRuntimeConfigInput;
}

export interface SkillStoreSearchInput {
  keyword?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'score' | 'downloads' | 'stars' | 'installs' | 'name';
  order?: 'asc' | 'desc';
  category?: string;
  source?: string;
  labels?: string;
}

export interface SkillStoreItem {
  slug: string;
  name: string;
  description: string;
  descriptionZh?: string;
  ownerName?: string;
  source?: string;
  homepage?: string;
  iconUrl?: string;
  version?: string;
  category?: string;
  tags: string[];
  downloads: number;
  installs: number;
  stars: number;
  score: number;
  updatedAt?: number;
}

export interface SkillStoreSearchResult {
  source: 'skillhub';
  page: number;
  pageSize: number;
  total: number;
  items: SkillStoreItem[];
}

export interface SkillStoreDetail {
  item: SkillStoreItem;
  readme?: string;
  skillMarkdown?: string;
  fileCount?: number;
  latestVersion?: string;
  securityStatus?: string;
}

export interface SkillStoreInstallInput {
  slug: string;
  source: EditableSkillSource;
  name?: string;
}

/** 给 SkillLoader 注入的最小 settings 接口（避免循环依赖）。 */
export interface SkillSettingsResolver {
  /** 检测一个 config key 是否"真"（用于 requires.config detection）。 */
  isTruthy(key: string): boolean;
}
