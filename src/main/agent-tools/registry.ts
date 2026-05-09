/**
 * OrbitToolRegistry — agent tool 元数据中心。
 *
 * 设计参考：plans/swift-vortex-darwin.md §2.2
 * Phase A 仅做：register / getByName / listAll / listForScope。
 * Phase B 起会接 skill-loader 与 ConversationScope 过滤。
 */

import type { AgentToolDef } from '@shared/agent-tools';
import type { ConversationScope } from '@shared/conversation';

export class OrbitToolRegistry {
  private readonly tools = new Map<string, AgentToolDef>();

  register(def: AgentToolDef): void {
    if (this.tools.has(def.name)) {
      throw new Error(`agent_tool_already_registered:${def.name}`);
    }
    this.tools.set(def.name, def);
  }

  registerMany(defs: readonly AgentToolDef[]): void {
    for (const def of defs) this.register(def);
  }

  getByName(name: string): AgentToolDef | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** 全量 tool 列表（按名字稳定排序）。 */
  listAll(): AgentToolDef[] {
    return [...this.tools.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * 按 ConversationScope.kind 过滤：
   *   - tool 未声明 scopes → 视为全 scope 可用
   *   - 否则需要 scope.kind ∈ tool.scopes
   */
  listForScope(scope: ConversationScope): AgentToolDef[] {
    return this.listAll().filter((tool) => !tool.scopes || tool.scopes.includes(scope.kind));
  }
}
