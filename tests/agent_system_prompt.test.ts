import { describe, expect, it } from 'vitest';
import { ASK_ANYWHERE_SYSTEM_PROMPT } from '../src/main/ask-anywhere/orchestrator';

describe('ASK_ANYWHERE_SYSTEM_PROMPT', () => {
  it('does not mention the Bash tool as a way to invoke orbit (Phase E.1 regression)', () => {
    // Phase A–D 之前的 prompt 让 LLM "Use the Bash tool to invoke 'orbit' CLI"，
    // 导致 DeepSeek/MiniMax 等模型跑去调根本不存在的 `bash` 工具或输出 ```bash 代码块。
    // Phase E.1 之后 prompt 只能引导 agent 调 orbit_* 工具。
    expect(ASK_ANYWHERE_SYSTEM_PROMPT).not.toMatch(/bash tool/i);
    expect(ASK_ANYWHERE_SYSTEM_PROMPT).not.toMatch(/invoke the local 'orbit' cli/i);
  });

  it('explicitly forbids ```bash / ```shell code fences', () => {
    expect(ASK_ANYWHERE_SYSTEM_PROMPT).toMatch(/```bash/);
    // 出现是允许的（讲述"不要输出"），但必须伴随禁用词 "Never"
    const banLine = ASK_ANYWHERE_SYSTEM_PROMPT.split('\n').find((l) => l.includes('```bash'));
    expect(banLine).toBeDefined();
    expect(banLine!.toLowerCase()).toMatch(/never|do not|don'?t/);
  });

  it('lists exact tool-call examples so schema-loose models (DeepSeek) get the shape right', () => {
    // 这些是 E.1 重写的关键示例，证明 prompt 告诉 LLM 具体参数 key 是 "id" 而非 "slug"
    expect(ASK_ANYWHERE_SYSTEM_PROMPT).toMatch(/orbit_project_overview/);
    expect(ASK_ANYWHERE_SYSTEM_PROMPT).toMatch(/"id":/);
    expect(ASK_ANYWHERE_SYSTEM_PROMPT).toMatch(/orbit_task_propose/);
    expect(ASK_ANYWHERE_SYSTEM_PROMPT).toMatch(/orbit_task_list/);
    expect(ASK_ANYWHERE_SYSTEM_PROMPT).toMatch(/orbit_search/);
    expect(ASK_ANYWHERE_SYSTEM_PROMPT).toMatch(/orbit_skill_read/);
  });

  it('mentions the is_error feedback loop so the agent self-corrects after a failed tool', () => {
    expect(ASK_ANYWHERE_SYSTEM_PROMPT).toMatch(/is_error/);
  });

  it('warns against inventing non-existent tool names', () => {
    expect(ASK_ANYWHERE_SYSTEM_PROMPT.toLowerCase()).toMatch(/never.*invent|do not invent|don'?t invent/);
  });

  it('requires loading matching skills instead of hardcoding slash-command behavior', () => {
    expect(ASK_ANYWHERE_SYSTEM_PROMPT).toMatch(/first call `orbit_skill_read`/);
    expect(ASK_ANYWHERE_SYSTEM_PROMPT).toMatch(/Claude Desktop/);
    expect(ASK_ANYWHERE_SYSTEM_PROMPT).toMatch(/Orbit skill configuration/);
  });

  it('keeps internal retrieval machinery out of normal user answers', () => {
    expect(ASK_ANYWHERE_SYSTEM_PROMPT).toMatch(/Answer the user's actual question first/);
    expect(ASK_ANYWHERE_SYSTEM_PROMPT).toMatch(/Treat `pmil_context_packet`/);
    expect(ASK_ANYWHERE_SYSTEM_PROMPT).toMatch(/Do not invent counts, dates, causes, or citations/);
    expect(ASK_ANYWHERE_SYSTEM_PROMPT).toMatch(/Distinguish "总发现" from "当前索引"/);
  });
});
