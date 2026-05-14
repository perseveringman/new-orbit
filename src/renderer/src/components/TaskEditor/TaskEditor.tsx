import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TaskExecutionMode, TaskRecord, TaskStatus } from '@shared/schemas';
import { normalizeTaskExecutionMode, TASK_EXECUTION_MODES, TASK_STATUSES } from '@shared/schemas';
import type {
  OrphanRescueCandidate,
  ProjectSummaryDTO,
  TaskGetResultDTO,
  TaskSectionName
} from '@shared/ipc';
import { useWorkspace } from '../../store/workspace';
import { useFiles } from '../../store/files';
import { MiniMarkdownEditor } from '../Editor/MiniMarkdownEditor';

/**
 * TaskEditor — structured editing surface for a single task markdown file.
 *
 * Top: frontmatter form (status/priority/due/effort/tags/depends_on/pre_conditions).
 * Bottom: four collapsible sections (Description / Thinking / Execution Log /
 *          Summary), each backed by a MiniMarkdownEditor. Execution Log is
 *          read-only by default; a Raw Edit toggle swaps in the editor.
 *
 * Tabs at the top switch between the Structured form and a Raw Markdown
 * view (writes via `fs.writeFile`). Saves are debounced ~400ms per field.
 *
 * Lost banner: if `task.lost` (project_uid unresolvable), we surface a
 * "Try rescue" button that calls `fs.rescueOrphan` and lists candidates.
 */

export interface TaskEditorProps {
  task: TaskRecord;
  /** All tasks in the same project, used for dependency + pre_conditions pickers. */
  siblings?: TaskRecord[];
  onFrontmatterChanged?(): void;
  onSectionsChanged?(): void;
}

const PRIORITIES = ['', 'low', 'med', 'high'] as const;
const MODE_COPY: Record<TaskExecutionMode, string> = {
  human: 'I do it myself',
  assisted: 'I lead, AI helps',
  agent: 'Agent may claim',
  scheduled: 'Schedule-triggered'
};
const SECTIONS: { key: TaskSectionName; label: string }[] = [
  { key: 'description', label: 'Description' },
  { key: 'thinking', label: 'Agent Thinking' },
  { key: 'executionLog', label: 'Execution Log' },
  { key: 'summary', label: 'Summary' }
];

const SAVE_DEBOUNCE_MS = 400;

export function TaskEditor({
  task,
  siblings = [],
  onFrontmatterChanged,
  onSectionsChanged
}: TaskEditorProps): JSX.Element {
  const dark = useWorkspace((s) => s.settings.theme === 'dark');
  const toast = useFiles((s) => s.toast);

  const [tab, setTab] = useState<'structured' | 'raw'>('structured');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState('');
  const [sections, setSections] = useState<TaskGetResultDTO['sections']>({
    description: '',
    thinking: '',
    executionLog: '',
    summary: '',
    other: ''
  });
  const [fm, setFm] = useState<Record<string, unknown>>({});
  const [collapsed, setCollapsed] = useState<Record<TaskSectionName, boolean>>({
    description: false,
    thinking: false,
    executionLog: false,
    summary: false
  });
  const [execLogEditable, setExecLogEditable] = useState(false);
  const [rescue, setRescue] = useState<OrphanRescueCandidate[] | null>(null);
  const [rescuing, setRescuing] = useState(false);
  const [projects, setProjects] = useState<ProjectSummaryDTO[]>([]);
  const [relinkUid, setRelinkUid] = useState<string>('');
  const [relinking, setRelinking] = useState(false);
  const path = task.filePath;

  const sectionTimers = useRef<Record<string, number>>({});
  const rawTimer = useRef<number | null>(null);
  const fmTimer = useRef<number | null>(null);
  const lastSavedSection = useRef<Record<TaskSectionName, string>>({
    description: '',
    thinking: '',
    executionLog: '',
      summary: ''
  });

  const applyTaskSnapshot = useCallback((next: TaskGetResultDTO): void => {
    setFm(next.frontmatter);
    setSections(next.sections);
    setRaw(next.raw);
    lastSavedSection.current = {
      description: next.sections.description,
      thinking: next.sections.thinking,
      executionLog: next.sections.executionLog,
      summary: next.sections.summary
    };
  }, []);

  const reloadTaskSnapshot = useCallback(async (): Promise<TaskGetResultDTO> => {
    const next = await window.orbit.task.get(path);
    applyTaskSnapshot(next);
    return next;
  }, [applyTaskSnapshot, path]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRescue(null);
    setExecLogEditable(false);
    void (async () => {
      try {
        const v = await window.orbit.task.get(path);
        if (cancelled) return;
        applyTaskSnapshot(v);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      for (const id of Object.values(sectionTimers.current)) {
        window.clearTimeout(id);
      }
      sectionTimers.current = {};
      if (rawTimer.current) window.clearTimeout(rawTimer.current);
        if (fmTimer.current) window.clearTimeout(fmTimer.current);
      };
  }, [applyTaskSnapshot, path]);

  const commitSection = useCallback(
    (section: TaskSectionName, value: string) => {
      if (lastSavedSection.current[section] === value) return;
      lastSavedSection.current[section] = value;
      void window.orbit.task
        .updateSection(path, section, value)
        .then(() => onSectionsChanged?.())
        .catch((e) => toast(`Save failed: ${(e as Error).message}`));
    },
    [path, onSectionsChanged, toast]
  );

  const queueSection = useCallback(
    (section: TaskSectionName, value: string) => {
      setSections((s) => ({ ...s, [section]: value }));
      const existing = sectionTimers.current[section];
      if (existing) window.clearTimeout(existing);
      sectionTimers.current[section] = window.setTimeout(() => {
        commitSection(section, value);
      }, SAVE_DEBOUNCE_MS);
    },
    [commitSection]
  );

  const commitFrontmatter = useCallback(
    (patch: Record<string, unknown>) => {
      void window.orbit.task
        .updateFrontmatter(path, patch)
        .then(() => onFrontmatterChanged?.())
        .catch((e) => {
          toast(`Save failed: ${(e as Error).message}`);
          void reloadTaskSnapshot().catch(() => undefined);
        });
    },
    [path, onFrontmatterChanged, reloadTaskSnapshot, toast]
  );

  const queueFrontmatter = useCallback(
    (patch: Record<string, unknown>) => {
      setFm((prev) => ({ ...prev, ...patch }));
      if (fmTimer.current) window.clearTimeout(fmTimer.current);
      fmTimer.current = window.setTimeout(() => {
        commitFrontmatter(patch);
      }, SAVE_DEBOUNCE_MS);
    },
    [commitFrontmatter]
  );

  const doRescue = useCallback(async () => {
    setRescuing(true);
    try {
      const hits = await window.orbit.fs.rescueOrphan(path);
      setRescue(hits);
      if (hits.length === 0) toast('No rescue candidates found');
      else toast(`${hits.length} candidate${hits.length > 1 ? 's' : ''} found`);
      try {
        const list = await window.orbit.project.list();
        setProjects(list.filter((p) => !p.legacy));
      } catch {
        /* ignore */
      }
    } catch (e) {
      toast(`Rescue failed: ${(e as Error).message}`);
    } finally {
      setRescuing(false);
    }
  }, [path, toast]);

  const doRelink = useCallback(async () => {
    if (!relinkUid) {
      toast('Pick a target project first');
      return;
    }
    setRelinking(true);
    try {
      const res = await window.orbit.task.relink(path, relinkUid);
      toast(
        res.moved
          ? `Relinked and moved to ${res.relPath}`
          : `Relinked (project_uid updated)`
      );
      setRescue(null);
      onFrontmatterChanged?.();
    } catch (e) {
      toast(`Relink failed: ${(e as Error).message}`);
    } finally {
      setRelinking(false);
    }
  }, [path, relinkUid, toast, onFrontmatterChanged]);

  const status = (fm['status'] as TaskStatus) ?? 'backlog';
  const title = (fm['title'] as string) ?? task.title;
  const priority = (fm['priority'] as string) ?? '';
  const due = (fm['due'] as string) ?? '';
  const effort = fm['effort'];
  const tags = Array.isArray(fm['tags']) ? (fm['tags'] as string[]) : [];
  const dependsOn = Array.isArray(fm['depends_on'])
    ? (fm['depends_on'] as string[])
    : (task.depends_on ?? []);
  const preConditions = Array.isArray(fm['pre_conditions'])
    ? (fm['pre_conditions'] as string[])
    : [];
  const derivedFrom =
    typeof fm['derived_from'] === 'string'
      ? (fm['derived_from'] as string)
      : typeof task.derived_from === 'string'
        ? task.derived_from
        : null;
  const executionMode =
    normalizeTaskExecutionMode(fm['execution_mode']) ??
    normalizeTaskExecutionMode(fm['execution_strategy']) ??
    task.execution_mode ??
    (task.execution_strategy === 'autonomous' ? 'agent' : 'human');

  const relationChoices = useMemo(
    () => siblings.filter((s) => s.uid && s.uid !== task.uid),
    [siblings, task.uid]
  );
  const dependencyState = useMemo(
    () => inspectDependencyState(dependsOn, relationChoices),
    [dependsOn, relationChoices]
  );

  const ctrl =
    'rounded border border-neutral-300 bg-white px-2 py-1 text-xs outline-none focus:border-sky-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200';
  const label = 'text-[11px] uppercase tracking-wider text-neutral-500';

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-500">
        Loading task…
      </div>
    );
  }
  if (error) {
    return (
      <div className="m-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-300">
        {error}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-4 py-2 text-xs dark:border-neutral-800">
        <span className="truncate font-medium">{title}</span>
        <span className="truncate text-neutral-500">{task.relPath}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            className={`rounded px-2 py-0.5 ${tab === 'structured' ? 'bg-neutral-200 dark:bg-neutral-800' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
            onClick={() => setTab('structured')}
          >
            Structured
          </button>
          <button
            className={`rounded px-2 py-0.5 ${tab === 'raw' ? 'bg-neutral-200 dark:bg-neutral-800' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
            onClick={() => setTab('raw')}
          >
            Raw Markdown
          </button>
        </div>
      </div>

      {task.lost && (
        <div className="flex shrink-0 items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
          <span className="font-medium">Lost task</span>
          <span className="truncate">
            Its project_uid cannot be resolved in this vault.
          </span>
          <button
            onClick={() => void doRescue()}
            disabled={rescuing}
            className="ml-auto rounded border border-amber-500/50 px-2 py-0.5 hover:bg-amber-500/20 disabled:opacity-40"
          >
            {rescuing ? 'Searching…' : 'Try rescue'}
          </button>
        </div>
      )}
      {rescue && rescue.length > 0 && (
        <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-[11px] text-amber-800 dark:text-amber-200">
          <div className="mb-1 font-medium">Rescue candidates</div>
          <ul className="space-y-0.5">
            {rescue.slice(0, 8).map((c) => (
              <li key={`${c.repo}:${c.commit}:${c.oldPath}`} className="truncate">
                <span className="font-mono">{c.commit.slice(0, 7)}</span>{' '}
                <span className="text-neutral-600 dark:text-neutral-400">{c.at}</span>{' '}
                <span>{c.newPath ?? c.oldPath}</span>{' '}
                <span className="text-neutral-500">({c.repo})</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="text-[11px] text-neutral-600 dark:text-neutral-300">
              Relink to project:
            </label>
            <select
              value={relinkUid}
              onChange={(e) => setRelinkUid(e.target.value)}
              className="rounded border border-amber-500/40 bg-white px-1 py-0.5 text-[11px] dark:bg-neutral-900"
            >
              <option value="">— pick —</option>
              {projects.map((p) => (
                <option key={p.uid} value={p.uid}>
                  {p.name} ({p.slug})
                </option>
              ))}
            </select>
            <button
              onClick={() => void doRelink()}
              disabled={!relinkUid || relinking}
              className="rounded border border-emerald-600/50 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-40 dark:text-emerald-300"
            >
              {relinking ? 'Relinking…' : 'Relink'}
            </button>
            <span className="text-neutral-500">
              Updates <code>project_uid</code> + moves file into the chosen project&apos;s
              <code>.agent/tasks/</code>.
            </span>
          </div>
        </div>
      )}

      {tab === 'structured' ? (
        <div className="flex-1 overflow-auto">
          <section className="grid grid-cols-2 gap-3 border-b border-neutral-200 p-4 text-xs dark:border-neutral-800 md:grid-cols-3">
            <Field label="Status" className={label}>
              <select
                value={status}
                onChange={(e) => queueFrontmatter({ status: e.target.value })}
                className={ctrl}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority" className={label}>
              <select
                value={priority}
                onChange={(e) =>
                  queueFrontmatter({
                    priority: e.target.value === '' ? undefined : e.target.value
                  })
                }
                className={ctrl}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p || '—'}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Due" className={label}>
              <input
                type="date"
                value={due}
                onChange={(e) =>
                  queueFrontmatter({
                    due: e.target.value === '' ? undefined : e.target.value
                  })
                }
                className={ctrl}
              />
            </Field>
            <Field label="Effort (hours)" className={label}>
              <input
                type="text"
                value={effort === undefined ? '' : String(effort)}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  if (v === '') return queueFrontmatter({ effort: undefined });
                  const n = Number(v);
                  queueFrontmatter({ effort: Number.isFinite(n) ? n : v });
                }}
                placeholder="e.g. 2 or m"
                className={ctrl}
              />
            </Field>
            <Field label="Mode" className={label}>
              <select
                value={executionMode}
                onChange={(e) => {
                  const next = e.target.value as TaskExecutionMode;
                  queueFrontmatter({
                    execution_mode: next,
                    execution_strategy: next === 'agent' ? 'autonomous' : 'manual'
                  });
                }}
                className={ctrl}
              >
                {TASK_EXECUTION_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode} — {MODE_COPY[mode]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tags" className={label}>
              <TagChips
                tags={tags}
                onChange={(next) => queueFrontmatter({ tags: next.length ? next : undefined })}
              />
            </Field>
            <Field label="Dependencies" className={label + ' md:col-span-3'}>
              <TaskRelationPicker
                all={relationChoices}
                value={dependsOn}
                onChange={(next) => queueFrontmatter({ depends_on: next })}
              />
              {dependencyState.unmet.length > 0 || dependencyState.missing.length > 0 ? (
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                  {describeDependencyState(dependencyState)}
                </p>
              ) : null}
            </Field>
            {derivedFrom ? (
              <Field label="Derived from" className={label}>
                <div className="rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-300">
                  {derivedFrom}
                </div>
              </Field>
            ) : null}
            <Field label="Pre-conditions" className={label + ' md:col-span-3'}>
              <TaskRelationPicker
                all={relationChoices}
                value={preConditions}
                onChange={(next) =>
                  queueFrontmatter({
                    pre_conditions: next.length ? next : undefined
                  })
                }
              />
            </Field>
          </section>

          <section className="space-y-4 p-4">
            {SECTIONS.map(({ key, label: sectionLabel }) => {
              const isLog = key === 'executionLog';
              const readOnly = isLog && !execLogEditable;
              return (
                <div key={key} className="rounded border border-neutral-200 dark:border-neutral-800">
                  <button
                    className="flex w-full items-center gap-2 border-b border-neutral-200 px-3 py-1.5 text-left text-xs font-semibold dark:border-neutral-800"
                    aria-expanded={!collapsed[key]}
                    aria-controls={`task-section-${key}`}
                    onClick={() =>
                      setCollapsed((c) => ({ ...c, [key]: !c[key] }))
                    }
                  >
                    <span>{collapsed[key] ? '▸' : '▾'}</span>
                    <span>{sectionLabel}</span>
                    {isLog && !collapsed[key] && (
                      <span className="ml-auto flex items-center gap-1">
                        <label className="flex items-center gap-1 text-[11px] font-normal text-neutral-500">
                          <input
                            type="checkbox"
                            checked={execLogEditable}
                            onChange={(e) => {
                              e.stopPropagation();
                              setExecLogEditable(e.target.checked);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          Raw edit
                        </label>
                      </span>
                    )}
                  </button>
                  {!collapsed[key] && (
                    <div className="p-2" id={`task-section-${key}`}>
                      {isLog && !execLogEditable ? (
                        <ExecutionLogList body={sections.executionLog} />
                      ) : (
                        <MiniMarkdownEditor
                          value={sections[key]}
                          onChange={(next) => queueSection(key, next)}
                          onBlur={() => {
                            const id = sectionTimers.current[key];
                            if (id) {
                              window.clearTimeout(id);
                              commitSection(key, sections[key]);
                            }
                          }}
                          dark={dark}
                          readOnly={readOnly}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4">
          <textarea
            value={raw}
            onChange={(e) => {
              const next = e.target.value;
              setRaw(next);
              if (rawTimer.current) window.clearTimeout(rawTimer.current);
              rawTimer.current = window.setTimeout(() => {
                void window.orbit.fs.writeFile(path, next).catch((err) => {
                  toast(`Save failed: ${(err as Error).message}`);
                });
              }, SAVE_DEBOUNCE_MS);
            }}
            spellCheck={false}
            className="h-full w-full rounded border border-neutral-200 bg-white/60 p-2 font-mono text-xs outline-none dark:border-neutral-800 dark:bg-neutral-950/40"
          />
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  className,
  children
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function TagChips({
  tags,
  onChange
}: {
  tags: string[];
  onChange(next: string[]): void;
}): JSX.Element {
  const [input, setInput] = useState('');
  function commit(v: string): void {
    const t = v.trim().replace(/^#/, '');
    if (!t) return;
    if (tags.includes(t)) {
      setInput('');
      return;
    }
    onChange([...tags, t]);
    setInput('');
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded bg-neutral-200 px-1.5 py-0.5 text-[11px] dark:bg-neutral-800"
        >
          {t}
          <button
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="text-neutral-500 hover:text-red-500"
            aria-label={`remove ${t}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit(input);
          } else if (e.key === 'Backspace' && input === '' && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => commit(input)}
        placeholder="+ tag"
        className="min-w-[60px] flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[11px] outline-none focus:border-sky-500 dark:border-neutral-700 dark:bg-neutral-900"
      />
    </div>
  );
}

export function toggleTaskRelationValue(value: string[], uid: string, checked: boolean): string[] {
  if (checked) {
    return value.includes(uid) ? value : [...value, uid];
  }
  return value.filter((entry) => entry !== uid);
}

export function inspectDependencyState(
  dependsOn: string[],
  choices: TaskRecord[]
): { unmet: TaskRecord[]; missing: string[] } {
  const known = new Map<string, TaskRecord>();
  for (const task of choices) {
    if (task.uid) known.set(task.uid, task);
  }

  const unmet: TaskRecord[] = [];
  const missing: string[] = [];
  for (const uid of dependsOn) {
    const task = known.get(uid);
    if (!task) {
      missing.push(uid);
      continue;
    }
    if (task.status !== 'done') unmet.push(task);
  }
  return { unmet, missing };
}

export function describeDependencyState(state: {
  unmet: TaskRecord[];
  missing: string[];
}): string {
  const parts: string[] = [];
  if (state.unmet.length > 0) {
    parts.push(
      `Waiting on ${state.unmet.length} task${state.unmet.length > 1 ? 's' : ''}: ${state.unmet
        .map((task) => task.title)
        .join(', ')}`
    );
  }
  if (state.missing.length > 0) {
    parts.push(`Missing dependency reference${state.missing.length > 1 ? 's' : ''}: ${state.missing.join(', ')}`);
  }
  return parts.join(' · ');
}

export function TaskRelationPicker({
  all,
  value,
  onChange
}: {
  all: TaskRecord[];
  value: string[];
  onChange(next: string[]): void;
}): JSX.Element {
  if (all.length === 0) {
    return (
      <p className="text-[11px] text-neutral-500">
        No other tasks in this project yet.
      </p>
    );
  }
  return (
    <div className="max-h-28 overflow-auto rounded border border-neutral-200 p-1 dark:border-neutral-800">
      {all.map((t) => {
        const uid = t.uid!;
        const checked = value.includes(uid);
        return (
          <label
            key={uid}
            className="flex items-center gap-2 rounded px-1 py-0.5 text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => {
                onChange(toggleTaskRelationValue(value, uid, e.target.checked));
              }}
            />
            <span className="truncate">{t.title}</span>
            <span className="ml-auto text-neutral-500">{t.status}</span>
          </label>
        );
      })}
    </div>
  );
}

function ExecutionLogList({ body }: { body: string }): JSX.Element {
  const lines = body.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return (
      <p className="px-2 py-1 text-[11px] text-neutral-500">
        No execution log entries yet.
      </p>
    );
  }
  return (
    <ul className="max-h-60 space-y-0.5 overflow-auto px-2 py-1 font-mono text-[11px]">
      {lines.map((l, i) => (
        <li key={i} className="whitespace-pre-wrap break-words">
          {l}
        </li>
      ))}
    </ul>
  );
}
