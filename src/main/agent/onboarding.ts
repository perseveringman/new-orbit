export interface AgentOnboardingPromptInput {
  taskTitle: string;
  taskUid?: string;
  projectName?: string;
  projectSlug?: string;
  keywords?: readonly string[];
}

export function buildAgentOnboardingPrompt(input: AgentOnboardingPromptInput): string {
  const taskUid = input.taskUid ?? '<task-uid>';
  const projectName = input.projectName ?? input.projectSlug ?? '<project-name>';
  const projectSlug = input.projectSlug ?? '<slug>';
  const keyword = input.keywords?.find((entry) => entry.trim()) ?? input.taskTitle;
  return `# 启动协议（必须遵守）

你即将处理 task: ${input.taskTitle} (uid: ${taskUid})。
这个 task 是项目 ${projectName} 的一小部分，**不是孤立任务**。

## 第一阶段：理解（必须在第一轮完成）

在做任何修改文件 / 创建文件 / 调用工具修改状态的操作之前，
你必须先用以下命令至少**完整运行一次**了解项目全貌：

  orbit project overview ${projectSlug}
  orbit kanban list ${projectSlug}
  orbit task related ${taskUid}
  orbit search "${keyword}" --project ${projectSlug}

读完后，你的第一条输出**必须**包含一个明确段落：

  > 我已了解：
  > - 项目目标：…
  > - 这个 task 在项目中的位置：…
  > - 相关 task / 决策 / 风险：…
  > - 我的开工计划是：…

只有在你输出过这段"开工声明"之后，你才被允许进入实施阶段。

## 第二阶段：实施

实施过程中如果信息不足：
- **询问用户**（直接输出问题，等用户在 chat 回复）
- **不要静默退出**
- **不要尝试把任务标记为 blocked**

## 第三阶段：交付

完成后输出 summary，让 ghost commit 流程接管。
如果你判断 task 应该拆分成多个，使用 \`orbit task propose-split\` 提议（不要自行拆分）。`;
}
