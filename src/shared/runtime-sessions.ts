export const RUNTIME_SESSION_AGENTS = [
  'all',
  'claude',
  'claude-internal',
  'amp',
  'copilot',
  'codebuddy',
  'box',
  'codex'
] as const;

export type RuntimeSessionAgentFilter = (typeof RUNTIME_SESSION_AGENTS)[number];
export type RuntimeSessionAgent = Exclude<RuntimeSessionAgentFilter, 'all'> | 'claude-code';

export interface RuntimeSessionListItem {
  id: string;
  agent: RuntimeSessionAgent | string;
  title: string;
  summary: string;
  timestamp: string;
  sortTimestamp?: string;
  projectName?: string;
  source?: string;
  path?: string;
  size?: number;
  model?: string;
  agentParam?: RuntimeSessionAgentFilter;
}

export interface RuntimeSessionToolCall {
  id?: string;
  name: string;
  input?: unknown;
}

export interface RuntimeSessionMessage {
  role: 'user' | 'assistant' | 'tool' | 'system' | string;
  type?: string;
  timestamp?: string;
  content?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: { output?: unknown } | unknown;
  toolCalls?: RuntimeSessionToolCall[];
  model?: string;
  tokenCount?: number;
}

export interface RuntimeSessionDetail {
  id: string;
  agent: RuntimeSessionAgent | string;
  source?: string;
  title?: string;
  projectName?: string;
  summary?: string;
  timestamp?: string;
  agentMode?: string;
  originator?: string;
  messages: RuntimeSessionMessage[];
}

export interface RuntimeSessionGroups {
  claude: RuntimeSessionListItem[];
  'claude-internal': RuntimeSessionListItem[];
  amp: RuntimeSessionListItem[];
  copilot: RuntimeSessionListItem[];
  codebuddy: RuntimeSessionListItem[];
  box: RuntimeSessionListItem[];
  codex: RuntimeSessionListItem[];
  total: number;
}

export interface RuntimeSessionDisplaySettings {
  showUser: boolean;
  showAssistant: boolean;
  showThinking: boolean;
  showToolCalls: boolean;
  showToolResults: boolean;
}

export interface RuntimeSessionMarkdownResult {
  text: string;
  filename: string;
}

export interface RuntimeSessionBridgeStatus {
  available: boolean;
  root: string;
  modulePath: string;
  message?: string;
}
