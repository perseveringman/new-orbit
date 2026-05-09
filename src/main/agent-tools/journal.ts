/**
 * AgentJournal — 低风险 destructive tool 的执行前快照（NDJSON 追加）。
 *
 * 设计参考：plans/swift-vortex-darwin.md §6 / §B9
 *
 * 用途：
 *   - 让 user 可在事故后回查"agent 在 X 时间，basedrunId Y 调用了什么 destructive tool、传了什么 input"
 *   - Phase B：仅记录 before-state 元信息（toolName/input/at），不做实际回滚
 *   - Phase D：可在此基础上加 post-state diff + 一键撤销
 *
 * 文件位置：
 *   <vault>/.orbit/agent-journal/<runId>.ndjson
 *
 * 一行一条 JSON。无 vault 时 noop（测试环境/未打开 vault 时静默跳过）。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';

export interface JournalEntry {
  runId: string;
  conversationId?: string;
  toolName: string;
  toolUseId: string;
  input: unknown;
  at: string;
  destructive: boolean;
}

export interface AgentJournalOptions {
  /** Vault 根路径；为空则关闭日志（noop）。 */
  vaultPath: string | null;
}

export class AgentJournal {
  constructor(private readonly opts: AgentJournalOptions) {}

  async record(entry: JournalEntry): Promise<void> {
    const vault = this.opts.vaultPath;
    if (!vault) return;
    const dir = path.join(vault, ORBIT_DIR, 'agent-journal');
    const file = path.join(dir, `${sanitizeRunId(entry.runId)}.ndjson`);
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.appendFile(file, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch (err) {
      // 失败不应阻止 tool 执行；仅日志（避免污染测试输出，使用 console.warn 一次性抑制）
      console.warn('[agent-journal] failed to append', {
        runId: entry.runId,
        toolName: entry.toolName,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
}

function sanitizeRunId(runId: string): string {
  return runId.replace(/[^A-Za-z0-9_-]/g, '_');
}
