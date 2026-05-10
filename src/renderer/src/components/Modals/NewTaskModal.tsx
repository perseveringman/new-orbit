import { useEffect, useState } from 'react';
import type { TaskRecord } from '@shared/schemas';
import type { CreateTaskResultDTO } from '@shared/ipc';
import { useFiles } from '../../store/files';

/**
 * NewTaskModal — creates a task inside a specific project via
 * `task.create`. On success, the parent is notified (to re-select the
 * freshly created task in the Kanban + open it in the editor).
 */

interface Props {
  open: boolean;
  projectUid?: string;
  areaUid?: string;
  resourceUid?: string;
  siblings?: TaskRecord[];
  onClose(): void;
  onCreated?(res: CreateTaskResultDTO): void;
}

const overlay =
  'fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm';
const panel =
  'w-[min(540px,92vw)] rounded-lg border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900';
const input =
  'w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm outline-none focus:border-sky-500 dark:border-neutral-700 dark:bg-neutral-900';
const btn =
  'rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800';
const btnPrimary =
  'rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40';

const PRIORITIES = ['', 'low', 'med', 'high'] as const;

export function NewTaskModal({
  open,
  projectUid,
  areaUid,
  resourceUid,
  siblings = [],
  onClose,
  onCreated
}: Props): JSX.Element | null {
  const toast = useFiles((s) => s.toast);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<string>('');
  const [due, setDue] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [preConds, setPreConds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setPriority('');
    setDue('');
    setTagInput('');
    setTags([]);
    setPreConds([]);
    setErr(null);
  }, [open]);

  if (!open) return null;

  const titleTrimmed = title.trim();
  const canSubmit = titleTrimmed.length > 0 && !busy;

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      if (!projectUid && !areaUid && !resourceUid) throw new Error('Task owner is missing.');
      const fm: Record<string, unknown> = {};
      if (priority) fm['priority'] = priority;
      if (due) fm['due'] = due;
      if (tags.length) fm['tags'] = tags;
      if (preConds.length) fm['pre_conditions'] = preConds;
      const res = await window.orbit.task.create({
        ...(projectUid ? { project_uid: projectUid } : {}),
        ...(areaUid ? { area_uid: areaUid } : {}),
        ...(resourceUid ? { resource_uid: resourceUid } : {}),
        title: titleTrimmed,
        description: description || undefined,
        frontmatter: Object.keys(fm).length ? fm : undefined
      });
      toast(`Task created → ${res.relPath}`);
      onCreated?.(res);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function addTag(v: string): void {
    const t = v.trim().replace(/^#/, '');
    if (!t) return;
    if (tags.includes(t)) {
      setTagInput('');
      return;
    }
    setTags([...tags, t]);
    setTagInput('');
  }

  return (
    <div className={overlay} onClick={onClose}>
      <div
        className={panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="border-b border-neutral-200 px-4 py-2 text-sm font-semibold dark:border-neutral-800">
          {resourceUid ? 'New Resource Task' : areaUid ? 'New Area Task' : 'New Task'}
        </div>
        <div className="space-y-3 p-4 text-xs">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-neutral-500">
              Title *
            </span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
              }}
              className={input}
              placeholder="What needs to happen?"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-neutral-500">
              Description
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={input + ' font-mono'}
              placeholder="Optional — seeds the # Description section"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-neutral-500">
                Priority
              </span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={input}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p || '—'}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-neutral-500">
                Due
              </span>
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className={input}
              />
            </label>
          </div>
          <div>
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-neutral-500">
              Tags
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded bg-neutral-200 px-1.5 py-0.5 text-[11px] dark:bg-neutral-800"
                >
                  {t}
                  <button
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    className="text-neutral-500 hover:text-red-500"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                onBlur={() => addTag(tagInput)}
                placeholder="+ tag"
                className="min-w-[80px] flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[11px] outline-none dark:border-neutral-700 dark:bg-neutral-900"
              />
            </div>
          </div>
          {siblings.length > 0 && (
            <div>
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-neutral-500">
                Pre-conditions
              </span>
              <div className="max-h-28 overflow-auto rounded border border-neutral-200 p-1 dark:border-neutral-800">
                {siblings
                  .filter((s) => s.uid)
                  .map((s) => {
                    const uid = s.uid!;
                    const checked = preConds.includes(uid);
                    return (
                      <label
                        key={uid}
                        className="flex items-center gap-2 rounded px-1 py-0.5 text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) setPreConds([...preConds, uid]);
                            else setPreConds(preConds.filter((x) => x !== uid));
                          }}
                        />
                        <span className="truncate">{s.title}</span>
                        <span className="ml-auto text-neutral-500">{s.status}</span>
                      </label>
                    );
                  })}
              </div>
            </div>
          )}
          {err && (
            <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-[11px] text-red-600 dark:text-red-300">
              {err}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-4 py-2 dark:border-neutral-800">
          <button className={btn} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className={btnPrimary}
            onClick={() => void submit()}
            disabled={!canSubmit}
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
