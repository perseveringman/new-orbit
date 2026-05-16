import { useEffect, useState } from 'react';
import type { TaskRecord, TaskStatus } from '@shared/schemas';
import { taskExecutionMode } from '@shared/schemas';
import type { DistillSuggestHit } from '@shared/ipc';
import { useFiles } from '../store/files';
import { useAgent } from '../store/agent';
import { useTaskDetails } from '../store/taskDetails';

interface Props {
  task: TaskRecord;
  onStatus?: (id: string, status: TaskStatus) => void;
}

// 60-second TTL cache (per-task) for suggestions so opening/closing the
// panel doesn't hammer the embedding + search path.
const suggestCache = new Map<string, { at: number; hits: DistillSuggestHit[] }>();
const SUGGEST_TTL_MS = 60_000;

async function fetchSuggest(taskId: string): Promise<DistillSuggestHit[]> {
  const cached = suggestCache.get(taskId);
  if (cached && Date.now() - cached.at < SUGGEST_TTL_MS) return cached.hits;
  try {
    const hits = await window.orbit.distill.suggest(taskId);
    suggestCache.set(taskId, { at: Date.now(), hits });
    return hits;
  } catch {
    return [];
  }
}

export function TaskRow({ task, onStatus }: Props): JSX.Element {
  const openPath = useFiles((s) => s.openPath);
  const startForTask = useAgent((s) => s.startForTask);
  const toast = useFiles((s) => s.toast);
  const detect = useAgent((s) => s.detect);
  const openTask = useTaskDetails((s) => s.openTask);
  // Default: ON for file-tracked project tasks; OFF for inline checklist items.
  const defaultWorktree = task.source === 'file' && Boolean(task.project_uid);
  const [useWorktree, setUseWorktree] = useState<boolean>(defaultWorktree);
  const [expanded, setExpanded] = useState(false);
  const [hits, setHits] = useState<DistillSuggestHit[] | null>(null);
  const mode = taskExecutionMode(task);
  const canDispatchAgent = mode === 'agent';

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    void fetchSuggest(task.id).then((h) => {
      if (!cancelled) setHits(h);
    });
    return () => {
      cancelled = true;
    };
  }, [expanded, task.id]);

  function jump(): void {
    openTask(task, task.project_uid ?? null);
  }

  async function dispatch(e: React.MouseEvent): Promise<void> {
    e.stopPropagation();
    const res = await startForTask(task.id, { useWorktree });
    if (res.kind === 'error') toast(`Agent：${res.message}`);
    else toast(`Agent 已派发${useWorktree ? '（Worktree）' : ''}（${res.runId}）`);
  }

  return (
    <div className="flex flex-col rounded border border-transparent px-0 py-0 hover:border-neutral-200 dark:hover:border-neutral-700">
      <div className="group flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-neutral-100/60 dark:hover:bg-neutral-800/60">
        <input
          type="checkbox"
          checked={task.status === 'done'}
          aria-label={`标记 ${task.title} 为已完成`}
          onChange={(e) => onStatus?.(task.id, e.target.checked ? 'done' : 'backlog')}
          className="mt-1 h-3.5 w-3.5"
        />
        <button onClick={jump} className="flex flex-1 flex-col items-start text-left">
          <span className="flex items-center gap-1.5">
            {task.origin && task.origin !== 'human' && (
              <span
                 title={`来源：${task.origin}`}
                className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-300"
              >
                {task.origin === 'agent' ? '🤖' : task.origin === 'system' ? '⚙️' : '📥'} {task.origin}
              </span>
            )}
            <span
              title={
                mode === 'agent'
                   ? '任务就绪后 Agent 可以领取。'
                  : mode === 'assisted'
                     ? '人主导的任务，可在对话中使用 AI。'
                    : mode === 'scheduled'
                       ? '由计划触发的任务。'
                       : '人主导的任务。'
              }
              className={
                'rounded px-1.5 py-0.5 text-[10px] font-medium ' +
                (mode === 'agent'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : mode === 'assisted'
                    ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                    : mode === 'scheduled'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300')
              }
            >
              {mode}
            </span>
            {task.owner_type && task.owner_id && (
              <span
                 title={`负责人：${task.owner_type} (${task.owner_id})`}
                className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-300"
              >
                👤 {task.owner_type}
              </span>
            )}
            {task.blocked_reason && (
              <span
                title={task.blocked_reason}
                className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-300"
              >
                 🚫 受阻
              </span>
            )}
            {(task.depends_on ?? []).length > 0 && task.status !== 'done' && (
              <span
                 title={`依赖 ${(task.depends_on ?? []).join(', ')}`}
                className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
              >
                 🔒 依赖 {(task.depends_on ?? []).length}
              </span>
            )}
            {task.ready && task.status === 'waiting' && (
              <span
                 title="所有前置条件已满足，可以开始"
                className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300"
              >
                 ✓ 就绪
              </span>
            )}
            {task.recommended && (
              <span
                 title="Orbit Daily Review 推荐"
                className="rounded-full bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-300"
              >
                 ✨ 推荐
              </span>
            )}
            <span
              className={
                'truncate ' +
                (task.status === 'done'
                  ? 'line-through text-neutral-400 dark:text-neutral-500'
                  : '')
              }
            >
               {task.title || '（未命名）'}
            </span>
          </span>
          <span className="truncate text-[11px] text-neutral-500">
            {task.relPath}
             {task.due ? ` · 截止 ${task.due}` : ''}
            {task.effort ? ` · ${task.effort}` : ''}
             {task.recommended_role ? ` · 角色：${task.recommended_role}` : ''}
          </span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
           title="相关历史经验"
          className="opacity-0 group-hover:opacity-100 rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
           {expanded ? '▾ 经验' : '▸ 经验'}
        </button>
        {canDispatchAgent && (
          <label
            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
             title="在 .orbit/worktrees/ 下新的 Git Worktree 中运行 Agent"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={useWorktree}
              onChange={(e) => setUseWorktree(e.target.checked)}
              className="h-3 w-3"
            />
             Worktree
          </label>
        )}
        {canDispatchAgent && (
          <button
            onClick={(e) => void dispatch(e)}
            disabled={detect ? !detect.available : false}
            title={
              detect?.available
                 ? '将此任务派发给 Claude Code Agent'
                 : '未检测到 Claude Code CLI'
            }
            className="opacity-0 group-hover:opacity-100 disabled:opacity-40 rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
             ▶ Agent
          </button>
        )}
        {onStatus && task.status !== 'done' && (
          <select
            value={task.status}
            onChange={(e) => onStatus(task.id, e.target.value as TaskStatus)}
            className="opacity-0 group-hover:opacity-100 rounded border border-neutral-300 bg-transparent px-1 py-0.5 text-[11px] dark:border-neutral-700"
          >
             <option value="backlog">{taskStatusLabel('backlog')}</option>
             <option value="waiting">{taskStatusLabel('waiting')}</option>
             <option value="todo">{taskStatusLabel('todo')}</option>
             <option value="doing">{taskStatusLabel('doing')}</option>
             <option value="blocked">{taskStatusLabel('blocked')}</option>
          </select>
        )}
      </div>
      {expanded && (
        <div className="mx-2 mb-1 rounded border border-neutral-200 bg-neutral-50/60 p-2 text-[11px] dark:border-neutral-800 dark:bg-neutral-900/60">
          <p className="mb-1 font-semibold text-neutral-600 dark:text-neutral-300">
             相关历史经验
          </p>
          {hits === null ? (
             <p className="text-neutral-500">搜索中…</p>
          ) : hits.length === 0 ? (
             <p className="text-neutral-500">没有达到阈值的相关资源。</p>
          ) : (
            <ul className="space-y-1">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    onClick={() => void openPath(h.meta.relPath)}
                    className="text-left hover:underline"
                     title={`分数 ${h.score.toFixed(3)}`}
                  >
                    <span className="font-semibold">{h.meta.title}</span>{' '}
                    <span className="text-neutral-500">
                       — {h.meta.relPath}（分数 {h.score.toFixed(2)}）
                    </span>
                  </button>
                  <p className="ml-2 text-neutral-500">{h.meta.excerpt}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function taskStatusLabel(status: TaskStatus): string {
  if (status === 'backlog') return '待整理';
  if (status === 'waiting') return '等待中';
  if (status === 'todo') return '待办';
  if (status === 'doing') return '进行中';
  if (status === 'blocked') return '受阻';
  if (status === 'done') return '已完成';
  return status;
}
