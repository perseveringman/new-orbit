import { useEffect, useMemo, useState } from 'react';
import type { EntitySummary } from '@shared/schemas';
import type { ProjectSummaryDTO, TemplateMetaDTO } from '@shared/ipc';
import { NewProjectForm, isValidSlug, slugify } from '../../schemas/newProject';
import { useFiles } from '../../store/files';
import { useWorkspace } from '../../store/workspace';

interface Props {
  open: boolean;
  onClose(): void;
  onCreated?(result: { uid: string; slug: string; readmePath: string }): void;
}

const overlay =
  'fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm';
const panel =
  'w-[min(560px,92vw)] rounded-lg border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900';
const btn =
  'rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800';
const btnPrimary =
  'rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40';
const input =
  'w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm outline-none focus:border-sky-500 dark:border-neutral-700 dark:bg-neutral-900';

export function NewProjectModal({ open, onClose, onCreated }: Props): JSX.Element | null {
  const toast = useFiles((s) => s.toast);
  const openPath = useFiles((s) => s.openPath);
  const refreshProjects = useWorkspace((s) => s.refreshProjects);
  const setActiveProjectUid = useWorkspace((s) => s.setActiveProjectUid);

  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [templates, setTemplates] = useState<TemplateMetaDTO[]>([]);
  const [template, setTemplate] = useState('blank');
  const [areas, setAreas] = useState<EntitySummary[]>([]);
  const [areaUid, setAreaUid] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [existingSlugs, setExistingSlugs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setName('');
    setSlug('');
    setSlugTouched(false);
    setDescription('');
    setTemplate('blank');
    setAreaUid('');
    setTags([]);
    setTagInput('');
    setErr(null);
    void (async () => {
      try {
        const [t, projects, ents] = await Promise.all([
          window.orbit.project.listTemplates(),
          window.orbit.project.list(),
          window.orbit.para.listEntities({ type: 'area' })
        ]);
        setTemplates(t);
        if (t.length && !t.find((x) => x.id === template)) setTemplate(t[0]!.id);
        setExistingSlugs((projects as ProjectSummaryDTO[]).map((p) => p.slug));
        setAreas(ents);
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-derive slug from name unless user edited it
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  const slugValid = isValidSlug(slug);
  const slugConflict = useMemo(() => existingSlugs.includes(slug), [existingSlugs, slug]);

  const canNext = name.trim().length > 0 && slugValid && !slugConflict && !!template;
  const canCreate = canNext;

  async function submit(): Promise<void> {
    if (!canCreate) return;
    setBusy(true);
    setErr(null);
    try {
      const parsed = NewProjectForm.parse({
        name: name.trim(),
        description: description.trim(),
        template,
        slug,
        area_uid: areaUid || undefined,
        tags: tags.length ? tags : undefined
      });
      const res = await window.orbit.project.create({
        slug: parsed.slug,
        template: parsed.template,
        name: parsed.name,
        description: parsed.description,
        ...(parsed.area_uid ? { area_uid: parsed.area_uid } : {}),
        ...(parsed.tags ? { tags: parsed.tags } : {})
      });
      await refreshProjects();
      setActiveProjectUid(res.uid);
      toast(`Created project ${res.slug}`);
      // Open README for instant editing (R3 will route to Project Room)
      const readmePath = `${res.projectPath}/README.md`;
      try {
        await openPath(readmePath);
      } catch {
        /* best-effort */
      }
      onCreated?.({ uid: res.uid, slug: res.slug, readmePath });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function addTag(): void {
    const t = tagInput.trim().replace(/,+$/g, '');
    if (!t) return;
    if (tags.includes(t)) return;
    setTags([...tags, t]);
    setTagInput('');
  }

  if (!open) return null;

  return (
    <div className={overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={panel} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <h2 className="text-sm font-semibold">New project — step {step} of 2</h2>
          <button className={btn} onClick={onClose} disabled={busy}>
            ✕
          </button>
        </header>

        <div className="space-y-3 px-4 py-4 text-sm">
          {step === 1 && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">Name</span>
                <input
                  className={input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Orbit Docs Site"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">
                  Slug <span className="text-neutral-400">(auto from name, editable)</span>
                </span>
                <input
                  className={
                    input +
                    ' ' +
                    (!slugValid || slugConflict
                      ? 'border-red-500 dark:border-red-500'
                      : '')
                  }
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setSlugTouched(true);
                  }}
                  placeholder="kebab-case-slug"
                />
                {slug && !slugValid && (
                  <p className="mt-1 text-[11px] text-red-500">
                    Must be lowercase kebab-case ASCII, 1–64 chars, no `--`.
                  </p>
                )}
                {slugValid && slugConflict && (
                  <p className="mt-1 text-[11px] text-red-500">
                    A project with this slug already exists.
                  </p>
                )}
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">Description</span>
                <textarea
                  className={input + ' min-h-[88px] resize-y'}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="One-liner or longer. Lands in README.md + AGENT.md."
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">Template</span>
                <select
                  className={input}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} — {t.description}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {step === 2 && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">
                  Area (optional)
                </span>
                <select
                  className={input}
                  value={areaUid}
                  onChange={(e) => setAreaUid(e.target.value)}
                >
                  <option value="">— none —</option>
                  {areas.map((a) => (
                    <option key={a.uid} value={a.uid}>
                      {a.title} ({a.relPath})
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <span className="mb-1 block text-xs text-neutral-500">Tags</span>
                <div className="flex flex-wrap items-center gap-1">
                  {tags.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTags(tags.filter((x) => x !== t))}
                      className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] text-neutral-700 hover:bg-red-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-red-900/50"
                      title="Click to remove"
                    >
                      #{t} ✕
                    </button>
                  ))}
                  <input
                    className="min-w-[120px] flex-1 rounded border border-neutral-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-sky-500 dark:border-neutral-700"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addTag();
                      } else if (e.key === 'Backspace' && !tagInput && tags.length) {
                        setTags(tags.slice(0, -1));
                      }
                    }}
                    placeholder="type + Enter"
                  />
                </div>
              </div>
              <div className="rounded border border-dashed border-neutral-300 p-3 text-xs text-neutral-500 dark:border-neutral-700">
                <div>
                  <b>Slug:</b> {slug}
                </div>
                <div>
                  <b>Template:</b> {template}
                </div>
                <div>
                  <b>Path:</b> 01_Projects/{slug}/
                </div>
              </div>
            </>
          )}
          {err && (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-600 dark:text-red-300">
              {err}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <button className={btn} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {step === 2 && (
              <button className={btn} onClick={() => setStep(1)} disabled={busy}>
                ← Back
              </button>
            )}
            {step === 1 ? (
              <button
                className={btnPrimary}
                onClick={() => setStep(2)}
                disabled={!canNext || busy}
              >
                Next →
              </button>
            ) : (
              <button className={btnPrimary} onClick={submit} disabled={!canCreate || busy}>
                {busy ? 'Creating…' : 'Create project'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
