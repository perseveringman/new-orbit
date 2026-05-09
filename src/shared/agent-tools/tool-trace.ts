/**
 * ToolTraceBlock — 跨 send() 持久化的 tool_use/tool_result 单元。
 *
 * Phase A：定义 schema 但暂不写入 ConversationTurn（Phase B 启用持久化与回放）。
 * Phase B：ConversationTurn.toolTrace?: ToolTraceBlock[] 写入 / rebuildMessages 反序列化。
 */

export interface ToolTraceBlock {
  /** Anthropic tool_use.id（toolu_xxx），用于配对 tool_result。 */
  toolUseId: string;
  /** Tool 名，如 'orbit_search'。 */
  toolName: string;
  /** LLM 提供的输入参数（已解析的 JSON）。 */
  input: unknown;
  /** Tool 执行后的字符串化结果（已截断到上限）。失败时配合 isError。 */
  result?: string;
  /** Tool 执行失败标记。 */
  isError?: boolean;
  /** ISO 时间戳。 */
  at: string;
  /** 执行耗时（ms）。 */
  durationMs?: number;
}
